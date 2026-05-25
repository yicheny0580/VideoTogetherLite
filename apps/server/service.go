package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const inviteCodeSeparator = "."

type VideoTogetherLiteService struct {
	mu             sync.Mutex
	rooms          map[string]*roomRecord
	sessions       map[string]*sessionRecord
	userRooms      map[string]string
	roomExpireTime time.Duration
}

func NewVideoTogetherLiteService(roomExpireTime time.Duration) *VideoTogetherLiteService {
	return &VideoTogetherLiteService{
		rooms:          map[string]*roomRecord{},
		sessions:       map[string]*sessionRecord{},
		userRooms:      map[string]string{},
		roomExpireTime: roomExpireTime,
	}
}

func Timestamp() float64 {
	return float64(time.Now().UnixMilli()) / 1000
}

func (s *VideoTogetherLiteService) Timestamp() float64 {
	return Timestamp()
}

type SharedVideoState struct {
	CurrentTime          float64 `json:"currentTime"`
	Duration             float64 `json:"duration"`
	IsLoading            bool    `json:"isLoading"`
	LastUpdateClientTime float64 `json:"lastUpdateClientTime"`
	LastUpdateServerTime float64 `json:"lastUpdateServerTime"`
	Paused               bool    `json:"paused"`
	PlaybackRate         float64 `json:"playbackRate"`
	Title                string  `json:"title"`
	URL                  string  `json:"url"`
}

type RoomParticipant struct {
	FocusedVideo       *SharedVideoState `json:"focusedVideo,omitempty"`
	LastSeenServerTime float64           `json:"lastSeenServerTime"`
	Nickname           string            `json:"nickname"`
	Sharing            bool              `json:"sharing"`
	UserID             string            `json:"userId"`
}

type Room struct {
	ParticipantCount int               `json:"participantCount"`
	Participants     []RoomParticipant `json:"participants"`
	RoomCode         string            `json:"roomCode"`
	UUID             string            `json:"uuid"`
}

type roomRecord struct {
	inviteSecretHash string
	participants     map[string]*RoomParticipant
	room             Room
}

type sessionRecord struct {
	lastSeen float64
	roomCode string
	userID   string
}

type CreateRoomInput struct {
	Nickname string
	UserID   string
}

type JoinRoomInput struct {
	InviteCode   string
	InviteSecret string
	Nickname     string
	RoomCode     string
	UserID       string
}

type GetRoomInput struct {
	SessionToken string
}

type LeaveRoomInput struct {
	SessionToken string
}

type UpdateRoomInput struct {
	FocusedVideo  *SharedVideoState
	Nickname      string
	SendLocalTime float64
	SessionToken  string
	Sharing       bool
}

type RoomSessionResult struct {
	InviteCode   string
	InviteSecret string
	Room         Room
	SessionToken string
	Timestamp    float64
}

func (s *VideoTogetherLiteService) CreateRoom(_ *VideoTogetherLiteContext, input CreateRoomInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := normalizeUserID(input.UserID)
	nickname := normalizeNickname(input.Nickname)
	now := s.Timestamp()
	s.removeUserFromActiveRoomLocked(userID, now)

	roomCode, err := s.createRoomCodeLocked()
	if err != nil {
		return RoomSessionResult{}, err
	}
	inviteSecret, err := randomSecret()
	if err != nil {
		return RoomSessionResult{}, err
	}
	room := &roomRecord{
		inviteSecretHash: hashSecret(inviteSecret),
		participants:     map[string]*RoomParticipant{},
		room: Room{
			RoomCode: roomCode,
			UUID:     uuid.NewString(),
		},
	}
	s.rooms[roomCode] = room
	room.upsertParticipant(userID, nickname, now)
	s.userRooms[userID] = roomCode

	token, err := s.createSessionLocked(roomCode, userID)
	if err != nil {
		return RoomSessionResult{}, err
	}

	return RoomSessionResult{
		InviteCode:   formatInviteCode(roomCode, inviteSecret),
		InviteSecret: inviteSecret,
		Room:         room.snapshot(now),
		SessionToken: token,
		Timestamp:    now,
	}, nil
}

func (s *VideoTogetherLiteService) JoinRoom(ctx *VideoTogetherLiteContext, input JoinRoomInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	roomCode, inviteSecret := normalizeInvite(input)
	if roomCode == "" || inviteSecret == "" {
		return RoomSessionResult{}, newAppError(errInvalidRequest, "invite code is required")
	}

	room := s.queryRoomLocked(roomCode)
	if room == nil {
		return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}
	if room.inviteSecretHash != hashSecret(inviteSecret) {
		return RoomSessionResult{}, newAppError(errWrongInviteSecret, GetErrorMessage(ctx.Language).WrongInviteSecret)
	}

	userID := normalizeUserID(input.UserID)
	nickname := normalizeNickname(input.Nickname)
	now := s.Timestamp()
	if s.userRooms[userID] != roomCode {
		s.removeUserFromActiveRoomLocked(userID, now)
		room = s.queryRoomLocked(roomCode)
		if room == nil {
			return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
		}
	} else {
		s.deleteUserSessionsLocked(userID)
	}
	room.upsertParticipant(userID, nickname, now)
	s.userRooms[userID] = roomCode

	token, err := s.createSessionLocked(roomCode, userID)
	if err != nil {
		return RoomSessionResult{}, err
	}

	return RoomSessionResult{
		Room:         room.snapshot(now),
		SessionToken: token,
		Timestamp:    now,
	}, nil
}

func (s *VideoTogetherLiteService) GetRoom(ctx *VideoTogetherLiteContext, input GetRoomInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, err := s.authenticateLocked(input.SessionToken)
	if err != nil {
		return RoomSessionResult{}, localizeAuthError(ctx, err)
	}
	room := s.queryRoomLocked(session.roomCode)
	if room == nil {
		return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}
	room.touchParticipant(session.userID, s.Timestamp())

	return RoomSessionResult{
		Room:      room.snapshot(s.Timestamp()),
		Timestamp: s.Timestamp(),
	}, nil
}

func (s *VideoTogetherLiteService) LeaveRoom(ctx *VideoTogetherLiteContext, input LeaveRoomInput) (RoomSessionResult, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, err := s.authenticateLocked(input.SessionToken)
	if err != nil {
		return RoomSessionResult{}, false, localizeAuthError(ctx, err)
	}

	roomCode := session.roomCode
	deleted := s.removeUserFromRoomLocked(session.userID, roomCode, s.Timestamp())
	if deleted {
		return RoomSessionResult{Timestamp: s.Timestamp()}, true, nil
	}

	room := s.queryRoomLocked(roomCode)
	if room == nil {
		return RoomSessionResult{Timestamp: s.Timestamp()}, true, nil
	}
	return RoomSessionResult{
		Room:      room.snapshot(s.Timestamp()),
		Timestamp: s.Timestamp(),
	}, false, nil
}

func (s *VideoTogetherLiteService) UpdateRoom(ctx *VideoTogetherLiteContext, input UpdateRoomInput) (RoomSessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, err := s.authenticateLocked(input.SessionToken)
	if err != nil {
		return RoomSessionResult{}, localizeAuthError(ctx, err)
	}
	room := s.queryRoomLocked(session.roomCode)
	if room == nil {
		return RoomSessionResult{}, newAppError(errRoomNotFound, GetErrorMessage(ctx.Language).RoomNotExist)
	}

	now := s.Timestamp()
	participant := room.upsertParticipant(session.userID, input.Nickname, now)
	participant.Sharing = input.Sharing
	if input.Sharing && input.FocusedVideo != nil {
		next := *input.FocusedVideo
		next.LastUpdateServerTime = now
		participant.FocusedVideo = &next
	} else {
		participant.FocusedVideo = nil
	}
	session.lastSeen = now

	return RoomSessionResult{
		Room:      room.snapshot(now),
		Timestamp: now,
	}, nil
}

func (s *VideoTogetherLiteService) RemoveExpiredRooms() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.Timestamp()
	for roomCode, room := range s.rooms {
		s.cleanupRoomLocked(roomCode, room, now)
	}
}

func (s *VideoTogetherLiteService) RoomExists(roomCode string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.queryRoomLocked(roomCode) != nil
}

func (s *VideoTogetherLiteService) queryRoomLocked(roomCode string) *roomRecord {
	room := s.rooms[roomCode]
	if room == nil {
		return nil
	}
	if s.cleanupRoomLocked(roomCode, room, s.Timestamp()) {
		return nil
	}
	return room
}

func (s *VideoTogetherLiteService) cleanupRoomLocked(roomCode string, room *roomRecord, now float64) bool {
	expireBefore := now - s.roomExpireTime.Seconds()
	for userID, participant := range room.participants {
		if participant.LastSeenServerTime < expireBefore {
			delete(room.participants, userID)
			delete(s.userRooms, userID)
			s.deleteUserSessionsLocked(userID)
		}
	}
	if len(room.participants) == 0 {
		delete(s.rooms, roomCode)
		for tokenHash, session := range s.sessions {
			if session.roomCode == roomCode {
				delete(s.sessions, tokenHash)
			}
		}
		return true
	}
	return false
}

func (s *VideoTogetherLiteService) createRoomCodeLocked() (string, error) {
	for i := 0; i < 10; i++ {
		roomCode, err := randomRoomCode()
		if err != nil {
			return "", err
		}
		if s.rooms[roomCode] == nil {
			return roomCode, nil
		}
	}
	return uuid.NewString(), nil
}

func (s *VideoTogetherLiteService) authenticateLocked(token string) (*sessionRecord, error) {
	if token == "" {
		return nil, newAppError(errUnauthorized, "sessionToken is required")
	}
	session := s.sessions[hashToken(token)]
	if session == nil {
		return nil, newAppError(errUnauthorized, "invalid session token")
	}
	session.lastSeen = s.Timestamp()
	return session, nil
}

func (s *VideoTogetherLiteService) createSessionLocked(roomCode, userID string) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	s.deleteUserSessionsLocked(userID)
	s.sessions[hashToken(token)] = &sessionRecord{
		lastSeen: s.Timestamp(),
		roomCode: roomCode,
		userID:   userID,
	}
	return token, nil
}

func (s *VideoTogetherLiteService) deleteUserSessionsLocked(userID string) {
	for tokenHash, session := range s.sessions {
		if session.userID == userID {
			delete(s.sessions, tokenHash)
		}
	}
}

func (s *VideoTogetherLiteService) removeUserFromActiveRoomLocked(userID string, now float64) {
	roomCode := s.userRooms[userID]
	if roomCode == "" {
		s.deleteUserSessionsLocked(userID)
		return
	}
	s.removeUserFromRoomLocked(userID, roomCode, now)
}

func (s *VideoTogetherLiteService) removeUserFromRoomLocked(userID, roomCode string, now float64) bool {
	room := s.rooms[roomCode]
	if room != nil {
		delete(room.participants, userID)
	}
	delete(s.userRooms, userID)
	s.deleteUserSessionsLocked(userID)
	if room == nil {
		return true
	}
	return s.cleanupRoomLocked(roomCode, room, now)
}

func (r *roomRecord) snapshot(_ float64) Room {
	participants := make([]RoomParticipant, 0, len(r.participants))
	for _, participant := range r.participants {
		if participant == nil {
			continue
		}
		copyParticipant := *participant
		if participant.FocusedVideo != nil {
			videoCopy := *participant.FocusedVideo
			copyParticipant.FocusedVideo = &videoCopy
		}
		participants = append(participants, copyParticipant)
	}
	sort.Slice(participants, func(i, j int) bool {
		if participants[i].Nickname == participants[j].Nickname {
			return participants[i].UserID < participants[j].UserID
		}
		return participants[i].Nickname < participants[j].Nickname
	})
	r.room.Participants = participants
	r.room.ParticipantCount = len(participants)
	return r.room
}

func (r *roomRecord) touchParticipant(userID string, now float64) {
	participant := r.participants[userID]
	if participant == nil {
		return
	}
	participant.LastSeenServerTime = now
}

func (r *roomRecord) upsertParticipant(userID, nickname string, now float64) *RoomParticipant {
	participant := r.participants[userID]
	if participant == nil {
		participant = &RoomParticipant{
			UserID: userID,
		}
		r.participants[userID] = participant
	}
	if nickname != "" {
		participant.Nickname = normalizeNickname(nickname)
	}
	if participant.Nickname == "" {
		participant.Nickname = normalizeNickname("")
	}
	participant.LastSeenServerTime = now
	return participant
}

func normalizeInvite(input JoinRoomInput) (string, string) {
	roomCode := strings.TrimSpace(input.RoomCode)
	inviteSecret := strings.TrimSpace(input.InviteSecret)
	inviteCode := strings.TrimSpace(input.InviteCode)
	if inviteCode != "" {
		parts := strings.SplitN(inviteCode, inviteCodeSeparator, 2)
		if len(parts) == 2 {
			roomCode = strings.TrimSpace(parts[0])
			inviteSecret = strings.TrimSpace(parts[1])
		}
	}
	return strings.ToUpper(roomCode), inviteSecret
}

func normalizeNickname(nickname string) string {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return "Viewer"
	}
	if len(nickname) > 40 {
		return nickname[:40]
	}
	return nickname
}

func normalizeUserID(userID string) string {
	if userID != "" {
		return userID
	}
	return uuid.NewString()
}

func formatInviteCode(roomCode, inviteSecret string) string {
	return roomCode + inviteCodeSeparator + inviteSecret
}

func randomRoomCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	out := make([]byte, len(bytes))
	for i, b := range bytes {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out), nil
}

func randomSecret() (string, error) {
	token := make([]byte, 16)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

func randomToken() (string, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func localizeAuthError(ctx *VideoTogetherLiteContext, err error) error {
	var appErr *appError
	if errors.As(err, &appErr) && appErr.Code == errUnauthorized {
		return newAppError(errUnauthorized, GetErrorMessage(ctx.Language).InvalidSession)
	}
	return err
}
