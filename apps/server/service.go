package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

type sessionRole string

const (
	sessionRoleHost   sessionRole = "host"
	sessionRoleMember sessionRole = "member"
)

type VideoTogetherService struct {
	mu             sync.Mutex
	rooms          map[string]*roomRecord
	sessions       map[string]*sessionRecord
	roomExpireTime time.Duration
}

func NewVideoTogetherService(roomExpireTime time.Duration) *VideoTogetherService {
	return &VideoTogetherService{
		rooms:          map[string]*roomRecord{},
		sessions:       map[string]*sessionRecord{},
		roomExpireTime: roomExpireTime,
	}
}

func Timestamp() float64 {
	return float64(time.Now().UnixMilli()) / 1000
}

func (s *VideoTogetherService) Timestamp() float64 {
	return Timestamp()
}

type Room struct {
	BeginLoadingTimestamp float64 `json:"beginLoadingTimestamp"`
	CurrentTime           float64 `json:"currentTime"`
	Duration              float64 `json:"duration"`
	LastUpdateClientTime  float64 `json:"lastUpdateClientTime"`
	LastUpdateServerTime  float64 `json:"lastUpdateServerTime"`
	MemberCount           int     `json:"memberCount"`
	Name                  string  `json:"name"`
	Paused                bool    `json:"paused"`
	PlaybackRate          float64 `json:"playbackRate"`
	Protected             bool    `json:"protected"`
	URL                   string  `json:"url"`
	UUID                  string  `json:"uuid"`
	VideoTitle            string  `json:"videoTitle"`
	WaitForLoading        bool    `json:"waitForLoading"`
}

type Member struct {
	CurrentURL          string `json:"currentUrl"`
	IsLoading           bool   `json:"isLoading"`
	UserID              string `json:"userId"`
	lastUpdateTimestamp float64
}

type roomRecord struct {
	room         Room
	passwordHash string
	hostID       string
	members      map[string]*Member
	userIDs      map[string]bool
}

type sessionRecord struct {
	lastSeen float64
	role     sessionRole
	roomName string
	userID   string
}

type JoinRoomInput struct {
	Password string
	RoomName string
	UserID   string
}

type GetRoomInput struct {
	RoomName     string
	SessionToken string
}

type HostUpdateInput struct {
	CurrentTime          float64
	Duration             float64
	LastUpdateClientTime float64
	Password             string
	Paused               bool
	PlaybackRate         float64
	Protected            bool
	RoomName             string
	SessionToken         string
	URL                  string
	UserID               string
	VideoTitle           string
}

type MemberUpdateInput struct {
	CurrentURL   string
	IsLoading    bool
	RoomName     string
	SessionToken string
	UserID       string
}

type RoomSessionResult struct {
	Room         Room
	SessionToken string
	Timestamp    float64
}

func (s *VideoTogetherService) JoinRoom(ctx *VtContext, input JoinRoomInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	room := s.queryRoomLocked(input.RoomName)
	if room == nil {
		return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}
	if !room.hasAccess(hashPassword(input.Password)) {
		return RoomSessionResult{}, newAppError(errWrongPassword, GetErrorMessage(ctx.Language).WrongPassword)
	}

	userID := normalizeUserID(input.UserID)
	token, err := s.createSessionLocked(input.RoomName, userID, sessionRoleMember)
	if err != nil {
		return RoomSessionResult{}, err
	}
	room.userIDs[userID] = true

	return RoomSessionResult{
		Room:         room.snapshot(s.Timestamp()),
		SessionToken: token,
		Timestamp:    s.Timestamp(),
	}, nil
}

func (s *VideoTogetherService) GetRoom(ctx *VtContext, input GetRoomInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, err := s.authenticateLocked(input.RoomName, input.SessionToken, sessionRoleHost, sessionRoleMember)
	if err != nil {
		return RoomSessionResult{}, localizeAuthError(ctx, err)
	}
	room := s.queryRoomLocked(session.roomName)
	if room == nil {
		return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}

	return RoomSessionResult{
		Room:      room.snapshot(s.Timestamp()),
		Timestamp: s.Timestamp(),
	}, nil
}

func (s *VideoTogetherService) HostUpdateRoom(ctx *VtContext, input HostUpdateInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	roomName := input.RoomName
	userID := normalizeUserID(input.UserID)
	var sessionToken string

	if input.SessionToken != "" {
		session, err := s.authenticateLocked(roomName, input.SessionToken, sessionRoleHost)
		if err != nil {
			return RoomSessionResult{}, localizeAuthError(ctx, err)
		}
		userID = session.userID
		roomName = session.roomName
	} else {
		room := s.queryRoomLocked(roomName)
		passwordHash := hashPassword(input.Password)
		if room == nil {
			room = s.createRoomLocked(roomName, passwordHash, userID)
		}
		if room.passwordHash != passwordHash {
			return RoomSessionResult{}, newAppError(errWrongPassword, GetErrorMessage(ctx.Language).HostWrongPassword)
		}
		room.hostID = userID
		room.userIDs[userID] = true
		s.invalidateHostSessionsLocked(roomName)
		token, err := s.createSessionLocked(roomName, userID, sessionRoleHost)
		if err != nil {
			return RoomSessionResult{}, err
		}
		sessionToken = token
	}

	room := s.queryRoomLocked(roomName)
	if room == nil {
		return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}
	room.applyHostUpdate(input, userID, s.Timestamp())

	return RoomSessionResult{
		Room:         room.snapshot(s.Timestamp()),
		SessionToken: sessionToken,
		Timestamp:    s.Timestamp(),
	}, nil
}

func (s *VideoTogetherService) UpdateMember(ctx *VtContext, input MemberUpdateInput) (RoomSessionResult, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, err := s.authenticateLocked(input.RoomName, input.SessionToken, sessionRoleMember)
	if err != nil {
		return RoomSessionResult{}, false, localizeAuthError(ctx, err)
	}
	room := s.queryRoomLocked(session.roomName)
	if room == nil {
		return RoomSessionResult{}, false, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}
	userID := input.UserID
	if userID == "" {
		userID = session.userID
	}

	changed := room.updateMember(Member{
		CurrentURL: input.CurrentURL,
		IsLoading:  input.IsLoading,
		UserID:     normalizeUserID(userID),
	}, s.Timestamp())

	return RoomSessionResult{
		Room:      room.snapshot(s.Timestamp()),
		Timestamp: s.Timestamp(),
	}, changed, nil
}

func (s *VideoTogetherService) RemoveExpiredRooms() {
	s.mu.Lock()
	defer s.mu.Unlock()

	expireTime := float64(time.Now().Add(-s.roomExpireTime).UnixMilli()) / 1000
	for name, room := range s.rooms {
		if room.room.LastUpdateClientTime < expireTime {
			delete(s.rooms, name)
			for tokenHash, session := range s.sessions {
				if session.roomName == name {
					delete(s.sessions, tokenHash)
				}
			}
		}
	}
}

func (s *VideoTogetherService) RoomExists(name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.queryRoomLocked(name) != nil
}

func (s *VideoTogetherService) queryRoomLocked(name string) *roomRecord {
	room := s.rooms[name]
	if room == nil {
		return nil
	}
	room.updateMemberData(s.Timestamp())
	return room
}

func (s *VideoTogetherService) createRoomLocked(name, passwordHash, hostID string) *roomRecord {
	room := &roomRecord{
		room: Room{
			Duration:             1e9,
			LastUpdateClientTime: s.Timestamp(),
			Name:                 name,
			UUID:                 uuid.NewString(),
		},
		passwordHash: passwordHash,
		hostID:       hostID,
		members:      map[string]*Member{},
		userIDs:      map[string]bool{},
	}
	s.rooms[name] = room
	return room
}

func (s *VideoTogetherService) authenticateLocked(roomName, token string, roles ...sessionRole) (*sessionRecord, error) {
	if roomName == "" {
		return nil, newAppError(errInvalidRequest, "roomName is required")
	}
	if token == "" {
		return nil, newAppError(errUnauthorized, "sessionToken is required")
	}
	session := s.sessions[hashToken(token)]
	if session == nil || session.roomName != roomName {
		return nil, newAppError(errUnauthorized, "invalid session token")
	}
	if !roleAllowed(session.role, roles) {
		return nil, newAppError(errForbidden, "session token is not allowed for this action")
	}
	session.lastSeen = s.Timestamp()
	return session, nil
}

func (s *VideoTogetherService) createSessionLocked(roomName, userID string, role sessionRole) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	s.sessions[hashToken(token)] = &sessionRecord{
		lastSeen: s.Timestamp(),
		role:     role,
		roomName: roomName,
		userID:   userID,
	}
	return token, nil
}

func (s *VideoTogetherService) invalidateHostSessionsLocked(roomName string) {
	for tokenHash, session := range s.sessions {
		if session.roomName == roomName && session.role == sessionRoleHost {
			delete(s.sessions, tokenHash)
		}
	}
}

func (r *roomRecord) applyHostUpdate(input HostUpdateInput, userID string, serverTime float64) {
	r.hostID = userID
	r.userIDs[userID] = true
	r.room.CurrentTime = input.CurrentTime
	r.room.Duration = input.Duration
	r.room.LastUpdateClientTime = input.LastUpdateClientTime
	r.room.LastUpdateServerTime = serverTime
	r.room.Paused = input.Paused
	r.room.PlaybackRate = input.PlaybackRate
	r.room.Protected = input.Protected
	r.room.URL = input.URL
	r.room.VideoTitle = input.VideoTitle
	r.updateMemberData(serverTime)
}

func (r *roomRecord) hasAccess(passwordHash string) bool {
	return !r.room.Protected || r.passwordHash == passwordHash
}

func (r *roomRecord) snapshot(now float64) Room {
	r.updateMemberData(now)
	if r.room.WaitForLoading {
		if r.room.BeginLoadingTimestamp == 0 {
			r.room.BeginLoadingTimestamp = now
		}
	} else {
		r.room.BeginLoadingTimestamp = 0
	}
	return r.room
}

func (r *roomRecord) updateMember(m Member, now float64) bool {
	m.lastUpdateTimestamp = now
	r.members[m.UserID] = &m
	memberCount := r.room.MemberCount
	loading := r.room.WaitForLoading
	r.updateMemberData(now)
	return memberCount != r.room.MemberCount || loading != r.room.WaitForLoading
}

func (r *roomRecord) updateMemberData(now float64) {
	count := 0
	waitForLoading := false
	for _, member := range r.members {
		if member != nil && member.isJoined(r.room.URL, now) {
			count++
			waitForLoading = waitForLoading || member.IsLoading
		}
	}
	waitForLoading = waitForLoading && r.room.Duration != r.room.CurrentTime
	if r.room.LastUpdateServerTime+10 > now {
		count++
	}
	r.room.MemberCount = count
	r.room.WaitForLoading = waitForLoading
}

func (m *Member) isJoined(roomURL string, now float64) bool {
	return m.lastUpdateTimestamp+10 > now && m.CurrentURL == roomURL
}

func normalizeUserID(userID string) string {
	if userID != "" {
		return userID
	}
	return uuid.NewString()
}

func roleAllowed(role sessionRole, roles []sessionRole) bool {
	for _, candidate := range roles {
		if role == candidate {
			return true
		}
	}
	return false
}

func randomToken() (string, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

func hashPassword(password string) string {
	sum := sha256.Sum256([]byte(password))
	return hex.EncodeToString(sum[:])
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func localizeAuthError(ctx *VtContext, err error) error {
	var appErr *appError
	if errors.As(err, &appErr) && appErr.Code == errUnauthorized {
		return newAppError(errUnauthorized, GetErrorMessage(ctx.Language).InvalidSession)
	}
	return err
}
