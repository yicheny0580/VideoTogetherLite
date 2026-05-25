package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var joinPanic = 0
var updatePanic = 0
var invalidBroadcast = 0

func (h *slashFix) newWsHandler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		language := r.URL.Query().Get("language")
		client := &Client{
			hub:       hub,
			conn:      conn,
			send:      make(chan []byte, 256),
			isHost:    false,
			vtContext: NewVtContext(language, r.RemoteAddr),
		}
		client.hub.register <- client
		go client.writePump()
		go client.readPump()
	}
}

func newWsHub(vtSrv *VideoTogetherService) *Hub {
	return &Hub{
		vtSrv:       vtSrv,
		broadcast:   make(chan Broadcast),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		roomClients: sync.Map{},
	}
}

type BroadcastType int32

const (
	ALL     BroadcastType = 0
	MEMBERS BroadcastType = 1
	HOST    BroadcastType = 2
)

type Broadcast struct {
	RoomName string
	Type     BroadcastType
	Message  interface{}
}

type WsRoomResponse struct {
	Method string       `json:"method"`
	Data   RoomResponse `json:"data"`
}

type RoomClients struct {
	name    string
	clients sync.Map
}

type Hub struct {
	vtSrv       *VideoTogetherService
	broadcast   chan Broadcast
	register    chan *Client
	unregister  chan *Client
	roomClients sync.Map
}

func (h *Hub) getRoomClients(roomName string) *RoomClients {
	rc, _ := h.roomClients.Load(roomName)
	if rc != nil {
		return rc.(*RoomClients)
	}
	rc, _ = h.roomClients.LoadOrStore(roomName, &RoomClients{
		name:    roomName,
		clients: sync.Map{},
	})
	return rc.(*RoomClients)
}

func (h *Hub) run() {
	cleanupTicker := time.NewTicker(5 * time.Minute)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-cleanupTicker.C:
			h.vtSrv.RemoveExpiredRooms()
			h.roomClients.Range(func(key, _ any) bool {
				if h.vtSrv.QueryRoom(key.(string)) == nil {
					h.roomClients.Delete(key)
				}
				return true
			})
		case <-h.register:
			continue
		case client := <-h.unregister:
			h.removeClientFromRoom(client.roomName, client)
		case message := <-h.broadcast:
			h.broadcastMessage(message)
		}
	}
}

func (h *Hub) broadcastMessage(message Broadcast) {
	b, err := json.Marshal(message.Message)
	if err != nil {
		fmt.Println("Encode json error: " + err.Error())
		return
	}
	room := h.vtSrv.QueryRoom(message.RoomName)
	if room == nil {
		return
	}

	roomClients := h.getRoomClients(message.RoomName)
	roomClients.clients.Range(func(key, value any) bool {
		client := key.(*Client)
		if client.isHost && !room.IsHost(client.lastTempUserId) {
			return true
		}
		switch message.Type {
		case MEMBERS:
			if client.isHost {
				return true
			}
		case HOST:
			if !client.isHost {
				return true
			}
		}
		select {
		case client.send <- b:
		default:
			h.removeClientFromRoom(message.RoomName, client)
		}
		return true
	})
}

func (h *Hub) removeClientFromRoom(roomName string, c *Client) {
	if roomName == "" {
		return
	}
	rc := h.getRoomClients(roomName)
	rc.clients.Delete(c)
}

func (h *Hub) isVaildClient(roomName string, c *Client) bool {
	rc := h.getRoomClients(roomName)
	value, ok := rc.clients.Load(c)
	return ok && value == true
}

func (h *Hub) addClientToRoom(roomName string, c *Client) {
	rc := h.getRoomClients(roomName)
	rc.clients.Store(c, true)
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024
)

var (
	newline = []byte{'\n'}
	space   = []byte{' '}
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	hub            *Hub
	conn           *websocket.Conn
	send           chan []byte
	roomName       string
	lastTempUserId string
	isHost         bool
	vtContext      *VtContext
}

type WsRequestMessage struct {
	Method string          `json:"method"`
	Data   json.RawMessage `json:"data"`
}

type WsResponseMessage struct {
	Method string      `json:"method"`
	Data   interface{} `json:"data"`
}

type JoinRoomRequest struct {
	RoomName     string `json:"name"`
	RoomPassword string `json:"password"`
}

type UpdateMemberRequest struct {
	*Member
	RoomName           string  `json:"roomName"`
	RoomPassword       string  `json:"password"`
	SendLocalTimestamp float64 `json:"sendLocalTimestamp"`
}

type UpdateRoomRequest struct {
	*Room
	TempUser           string  `json:"tempUser"`
	Password           string  `json:"password"`
	SendLocalTimestamp float64 `json:"sendLocalTimestamp"`
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		message = bytes.TrimSpace(bytes.Replace(message, newline, space, -1))
		var req WsRequestMessage
		if err = json.Unmarshal(message, &req); err != nil {
			c.reply("", nil, errors.New("invalid data"))
			continue
		}

		switch req.Method {
		case "/room/join":
			c.joinRoom(&req)
		case "/room/update":
			c.updateRoom(&req)
		case "/room/update_member":
			c.updateMember(&req)
		default:
			c.reply(req.Method, nil, errors.New("unknown method"))
		}
	}
}

func (c *Client) sendBroadcast(broadcast *Broadcast) {
	if c.roomName == "" {
		invalidBroadcast++
		return
	}
	room := c.hub.vtSrv.QueryRoom(c.roomName)
	if room == nil {
		invalidBroadcast++
		return
	}
	if c.isHost && !room.IsHost(c.lastTempUserId) {
		invalidBroadcast++
		return
	}
	if !c.hub.isVaildClient(c.roomName, c) {
		invalidBroadcast++
		return
	}
	c.hub.broadcast <- *broadcast
}

func (c *Client) joinRoom(rawReq *WsRequestMessage) {
	var req JoinRoomRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.reply(rawReq.Method, nil, errors.New("invalid data"))
		return
	}
	roomPw := GetMD5Hash(req.RoomPassword)

	room := c.hub.vtSrv.QueryRoom(req.RoomName)
	if room == nil {
		c.reply(rawReq.Method, nil, errors.New(GetErrorMessage(c.vtContext.Language).RoomNotExist))
		return
	}
	if !room.HasAccess(roomPw) {
		c.reply(rawReq.Method, nil, errors.New(GetErrorMessage(c.vtContext.Language).WrongPassword))
		return
	}

	if c.roomName != "" && c.roomName != req.RoomName {
		joinPanic++
		c.conn.Close()
		return
	}

	c.roomName = req.RoomName
	c.hub.addClientToRoom(req.RoomName, c)
	c.reply(rawReq.Method, RoomResponse{
		TimestampResponse: &TimestampResponse{Timestamp: c.hub.vtSrv.Timestamp()},
		Room:              room,
	}, nil)
}

func (c *Client) updateMember(rawReq *WsRequestMessage) {
	startTime := Timestamp()
	var req UpdateMemberRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.reply(rawReq.Method, nil, errors.New("invalid data"))
		return
	}
	roomPw := GetMD5Hash(req.RoomPassword)
	room := c.hub.vtSrv.QueryRoom(req.RoomName)
	if room == nil {
		c.reply(rawReq.Method, nil, errors.New(GetErrorMessage(c.vtContext.Language).RoomNotExist))
		return
	}
	if !room.HasAccess(roomPw) {
		c.reply(rawReq.Method, nil, errors.New(GetErrorMessage(c.vtContext.Language).WrongPassword))
		return
	}

	needNotification := room.UpdateMember(*req.Member)
	if needNotification {
		c.sendBroadcast(&Broadcast{
			RoomName: room.Name,
			Type:     ALL,
			Message: WsRoomResponse{
				Method: rawReq.Method,
				Data: RoomResponse{
					TimestampResponse: &TimestampResponse{Timestamp: c.hub.vtSrv.Timestamp()},
					Room:              room,
				},
			},
		})
	}
	c.replyTimestamp(req.SendLocalTimestamp, startTime, Timestamp())
}

func (c *Client) updateRoom(rawReq *WsRequestMessage) {
	startTime := Timestamp()
	var req UpdateRoomRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.reply(rawReq.Method, nil, errors.New("invalid data"))
		return
	}
	roomPw := GetMD5Hash(req.Password)

	if c.roomName != "" && c.roomName != req.Room.Name {
		updatePanic++
		c.conn.Close()
		return
	}
	c.roomName = req.Room.Name

	room, err := c.hub.vtSrv.GetAndCheckUpdatePermissionsOfRoom(c.vtContext, req.Name, roomPw, req.TempUser)
	if err != nil {
		c.reply(rawReq.Method, nil, err)
		return
	}
	c.lastTempUserId = req.TempUser

	room.PlaybackRate = req.PlaybackRate
	room.CurrentTime = req.CurrentTime
	room.Paused = req.Paused
	room.Url = req.Url
	room.LastUpdateClientTime = req.LastUpdateClientTime
	room.Duration = req.Duration
	room.LastUpdateServerTime = c.hub.vtSrv.Timestamp()
	room.Protected = req.Protected
	room.VideoTitle = req.VideoTitle

	c.isHost = true
	c.roomName = room.Name
	c.hub.addClientToRoom(room.Name, c)
	c.sendBroadcast(&Broadcast{
		RoomName: room.Name,
		Type:     ALL,
		Message: WsRoomResponse{
			Method: rawReq.Method,
			Data: RoomResponse{
				TimestampResponse: &TimestampResponse{Timestamp: c.hub.vtSrv.Timestamp()},
				Room:              room,
			},
		},
	})
	c.replyTimestamp(req.SendLocalTimestamp, startTime, Timestamp())
}

type WsErrorResponse struct {
	Method       string `json:"method"`
	ErrorMessage string `json:"errorMessage"`
}

func (c *Client) replyTimestamp(sl float64, rs float64, ss float64) {
	c.reply("replay_timestamp", TimestampV2Response{
		SendLocalTimestamp:     sl,
		ReceiveServerTimestamp: rs,
		SendServerTimestamp:    ss,
	}, nil)
}

func (c *Client) reply(method string, data interface{}, err error) {
	errFn := func(err error) {
		b, _ := json.Marshal(WsErrorResponse{
			Method:       method,
			ErrorMessage: err.Error(),
		})
		c.send <- b
	}

	if err != nil {
		errFn(err)
		return
	}

	if b, err := json.Marshal(WsResponseMessage{
		Method: method,
		Data:   data,
	}); err != nil {
		errFn(err)
	} else {
		c.send <- b
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write(newline)
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
