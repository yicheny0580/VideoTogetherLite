package main

import (
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

type VideoTogetherService struct {
	rooms          sync.Map
	roomExpireTime time.Duration
}

func NewVideoTogetherService(roomExpireTime time.Duration) *VideoTogetherService {
	return &VideoTogetherService{
		rooms:          sync.Map{},
		roomExpireTime: roomExpireTime,
	}
}

func Timestamp() float64 {
	return float64(time.Now().UnixMilli()) / 1000
}

func (s *VideoTogetherService) Timestamp() float64 {
	return Timestamp()
}

func (s *VideoTogetherService) GetAndCheckUpdatePermissionsOfRoom(ctx *VtContext, roomName, roomPassword string, userId string) (*Room, error) {
	room := s.QueryRoom(roomName)
	if room == nil {
		room = s.CreateRoom(roomName, roomPassword, userId)
	}

	isNewUser := !room.QueryUser(userId)
	if isNewUser {
		room.NewUser(userId)
	}

	if room.password != roomPassword {
		return nil, errors.New(GetErrorMessage(ctx.Language).HostWrongPassword)
	}

	if !room.IsHost(userId) {
		if isNewUser {
			room.setHost(userId)
		} else {
			return nil, errors.New(GetErrorMessage(ctx.Language).OtherHostSyncing)
		}
	}

	return room, nil
}

func (s *VideoTogetherService) CreateRoom(name, password string, hostId string) *Room {
	room := &Room{
		Name:                 name,
		password:             password,
		LastUpdateClientTime: s.Timestamp(),
		hostId:               hostId,
		Uuid:                 uuid.New().String(),
		members:              sync.Map{},
		userIds:              sync.Map{},
	}
	s.rooms.Store(name, room)
	return room
}

func (s *VideoTogetherService) QueryRoom(name string) *Room {
	room, _ := s.rooms.Load(name)
	if room == nil {
		return nil
	}
	pRoom := room.(*Room)
	pRoom.UpdateMemberData()
	if pRoom.WaitForLoadding {
		if pRoom.BeginLoaddingTimestamp == 0 {
			pRoom.BeginLoaddingTimestamp = s.Timestamp()
		}
	} else {
		pRoom.BeginLoaddingTimestamp = 0
	}
	return pRoom
}

func (s *VideoTogetherService) RemoveExpiredRooms() {
	expireTime := float64(time.Now().Add(-s.roomExpireTime).UnixMilli()) / 1000
	s.rooms.Range(func(key, value any) bool {
		room := value.(*Room)
		if room.LastUpdateClientTime < expireTime {
			s.rooms.Delete(key)
		}
		return true
	})
}

func (r *Room) QueryUser(userId string) bool {
	_, ok := r.userIds.Load(userId)
	return ok
}

func (r *Room) NewUser(userId string) {
	r.userIds.Store(userId, true)
}

func (r *Room) UpdateMember(m Member) bool {
	m.lastUpdateTimestamp = Timestamp()
	m.room = r
	r.members.Store(m.UserId, &m)
	memberCount := r.MemberCount
	loading := r.WaitForLoadding
	r.UpdateMemberData()
	return memberCount != r.MemberCount || loading != r.WaitForLoadding
}

type Room struct {
	Name                 string  `json:"name"`
	LastUpdateClientTime float64 `json:"lastUpdateClientTime"`
	LastUpdateServerTime float64 `json:"lastUpdateServerTime"`
	PlaybackRate         float64 `json:"playbackRate"`
	CurrentTime          float64 `json:"currentTime"`
	Paused               bool    `json:"paused"`
	Url                  string  `json:"url"`
	Duration             float64 `json:"duration"`
	Protected            bool    `json:"protected"`
	VideoTitle           string  `json:"videoTitle"`
	Uuid                 string  `json:"uuid"`

	WaitForLoadding        bool    `json:"waitForLoadding"`
	BeginLoaddingTimestamp float64 `json:"beginLoaddingTimestamp"`
	MemberCount            int     `json:"memberCount"`

	userIds  sync.Map
	members  sync.Map
	hostId   string
	password string
}

type Member struct {
	UserId              string `json:"userId"`
	IsLoadding          bool   `json:"isLoadding"`
	CurrentUrl          string `json:"currentUrl"`
	lastUpdateTimestamp float64

	room *Room
}

func (m *Member) IsJoined() bool {
	return m.lastUpdateTimestamp+10 > Timestamp() && m.CurrentUrl == m.room.Url
}

func (r *Room) UpdateMemberData() {
	count := 0
	waitForLoadding := false
	r.members.Range(func(_, value any) bool {
		member := value.(*Member)
		if member != nil && member.IsJoined() {
			count++
			waitForLoadding = waitForLoadding || member.IsLoadding
		}
		return true
	})
	waitForLoadding = waitForLoadding && r.Duration != r.CurrentTime
	if r.LastUpdateServerTime+10 > Timestamp() {
		count++
	}
	r.MemberCount = count
	r.WaitForLoadding = waitForLoadding
}

func (r *Room) HasAccess(password string) bool {
	return !r.Protected || r.password == password
}

func (r *Room) IsHost(userId string) bool {
	return r.hostId == userId
}

func (r *Room) setHost(userId string) {
	r.hostId = userId
}
