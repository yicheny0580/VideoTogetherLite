package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

func (h *slashFix) newWsHandler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		language := r.URL.Query().Get("language")
		client := &Client{
			hub:         hub,
			conn:        conn,
			send:        make(chan []byte, 256),
			liteContext: NewVideoTogetherLiteContext(language),
		}
		go client.writePump()
		go client.readPump()
	}
}

func newWsHub(liteService *VideoTogetherLiteService) *Hub {
	return &Hub{
		liteService: liteService,
		roomClients: map[string]map[*Client]bool{},
	}
}

type Hub struct {
	mu          sync.RWMutex
	liteService *VideoTogetherLiteService
	roomClients map[string]map[*Client]bool
}

func (h *Hub) run() {
	cleanupTicker := time.NewTicker(5 * time.Minute)
	defer cleanupTicker.Stop()

	for range cleanupTicker.C {
		h.liteService.RemoveExpiredRooms()
		h.cleanupExpiredRooms()
	}
}

func (h *Hub) addClientToRoom(roomName string, c *Client) {
	if roomName == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	if c.roomName != "" && c.roomName != roomName {
		delete(h.roomClients[c.roomName], c)
	}
	c.roomName = roomName
	clients := h.roomClients[roomName]
	if clients == nil {
		clients = map[*Client]bool{}
		h.roomClients[roomName] = clients
	}
	clients[c] = true
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if c.roomName == "" {
		return
	}
	delete(h.roomClients[c.roomName], c)
}

func (h *Hub) broadcastRoom(roomName string, response WsResponseMessage) {
	b, err := json.Marshal(response)
	if err != nil {
		log.Printf("websocket encode error: %v", err)
		return
	}

	h.mu.RLock()
	clients := h.roomClients[roomName]
	for client := range clients {
		select {
		case client.send <- b:
		default:
			go h.closeSlowClient(client)
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) closeSlowClient(c *Client) {
	h.removeClient(c)
	_ = c.conn.Close()
}

func (h *Hub) cleanupExpiredRooms() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for roomName := range h.roomClients {
		if !h.liteService.RoomExists(roomName) {
			delete(h.roomClients, roomName)
		}
	}
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	roomName    string
	liteContext *VideoTogetherLiteContext
}

type WsRequestMessage struct {
	Data json.RawMessage `json:"data"`
	ID   string          `json:"id"`
	Type string          `json:"type"`
}

type WsResponseMessage struct {
	Data interface{} `json:"data,omitempty"`
	ID   string      `json:"id,omitempty"`
	Type string      `json:"type"`
}

type WsErrorResponse struct {
	Error ErrorBody `json:"error"`
	ID    string    `json:"id,omitempty"`
	Type  string    `json:"type"`
}

func (c *Client) readPump() {
	defer func() {
		c.hub.removeClient(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			break
		}

		var req WsRequestMessage
		if err = json.Unmarshal(message, &req); err != nil {
			c.replyError("", newAppError(errInvalidRequest, "invalid JSON message"))
			continue
		}

		switch req.Type {
		case "room.join":
			c.joinRoom(&req)
		case "room.get":
			c.getRoom(&req)
		case "room.hostUpdate":
			c.updateRoom(&req)
		case "room.memberUpdate":
			c.updateMember(&req)
		default:
			c.replyError(req.ID, newAppError(errInvalidRequest, "unknown message type"))
		}
	}
}

func (c *Client) joinRoom(rawReq *WsRequestMessage) {
	var req joinRoomRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.replyError(rawReq.ID, newAppError(errInvalidRequest, "invalid data"))
		return
	}

	result, err := c.hub.liteService.JoinRoom(c.liteContext, JoinRoomInput{
		Password: req.Password,
		RoomName: req.Name,
		UserID:   req.UserID,
	})
	if err != nil {
		c.replyError(rawReq.ID, err)
		return
	}
	c.hub.addClientToRoom(req.Name, c)
	c.replyRoom(rawReq.ID, rawReq.Type, result)
}

func (c *Client) getRoom(rawReq *WsRequestMessage) {
	var req getRoomRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.replyError(rawReq.ID, newAppError(errInvalidRequest, "invalid data"))
		return
	}

	result, err := c.hub.liteService.GetRoom(c.liteContext, GetRoomInput{
		RoomName:     req.Name,
		SessionToken: req.SessionToken,
	})
	if err != nil {
		c.replyError(rawReq.ID, err)
		return
	}
	c.hub.addClientToRoom(req.Name, c)
	c.replyRoom(rawReq.ID, rawReq.Type, result)
}

func (c *Client) updateMember(rawReq *WsRequestMessage) {
	startTime := Timestamp()
	var req memberUpdateRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.replyError(rawReq.ID, newAppError(errInvalidRequest, "invalid data"))
		return
	}

	result, needNotification, err := c.hub.liteService.UpdateMember(c.liteContext, MemberUpdateInput{
		CurrentURL:   req.CurrentURL,
		IsLoading:    req.IsLoading,
		RoomName:     req.RoomName,
		SessionToken: req.SessionToken,
		UserID:       req.UserID,
	})
	if err != nil {
		c.replyError(rawReq.ID, err)
		return
	}
	c.hub.addClientToRoom(req.RoomName, c)
	c.replyRoom(rawReq.ID, rawReq.Type, result)
	c.replyTimestamp(rawReq.ID, req.SendLocalTimestamp, startTime, Timestamp())
	if needNotification {
		c.hub.broadcastRoom(req.RoomName, roomUpdatedMessage(result))
	}
}

func (c *Client) updateRoom(rawReq *WsRequestMessage) {
	startTime := Timestamp()
	var req hostUpdateRequest
	if err := json.Unmarshal(rawReq.Data, &req); err != nil {
		c.replyError(rawReq.ID, newAppError(errInvalidRequest, "invalid data"))
		return
	}
	if err := validateHostUpdate(req); err != nil {
		c.replyError(rawReq.ID, err)
		return
	}

	result, err := c.hub.liteService.HostUpdateRoom(c.liteContext, HostUpdateInput{
		CurrentTime:          req.CurrentTime,
		Duration:             req.Duration,
		LastUpdateClientTime: req.LastUpdateClientTime,
		Password:             req.Password,
		Paused:               req.Paused,
		PlaybackRate:         req.PlaybackRate,
		Protected:            req.Protected,
		RoomName:             req.Name,
		SessionToken:         req.SessionToken,
		URL:                  req.URL,
		UserID:               req.UserID,
		VideoTitle:           req.VideoTitle,
	})
	if err != nil {
		c.replyError(rawReq.ID, err)
		return
	}
	c.hub.addClientToRoom(req.Name, c)
	c.replyRoom(rawReq.ID, rawReq.Type, result)
	c.replyTimestamp(rawReq.ID, req.SendLocalTimestamp, startTime, Timestamp())
	c.hub.broadcastRoom(req.Name, roomUpdatedMessage(result))
}

func roomUpdatedMessage(result RoomSessionResult) WsResponseMessage {
	return WsResponseMessage{
		Type: "room.updated",
		Data: RoomSessionResponse{
			Room:      result.Room,
			Timestamp: result.Timestamp,
		},
	}
}

func (c *Client) replyRoom(id, messageType string, result RoomSessionResult) {
	c.reply(WsResponseMessage{
		ID:   id,
		Type: messageType,
		Data: RoomSessionResponse{
			Room:         result.Room,
			SessionToken: result.SessionToken,
			Timestamp:    result.Timestamp,
		},
	})
}

func (c *Client) replyTimestamp(id string, sl float64, rs float64, ss float64) {
	c.reply(WsResponseMessage{
		ID:   id,
		Type: "timestamp.replay",
		Data: TimestampReplayResponse{
			SendLocalTimestamp:     sl,
			ReceiveServerTimestamp: rs,
			SendServerTimestamp:    ss,
		},
	})
}

func (c *Client) replyError(id string, err error) {
	var appErr *appError
	if !errors.As(err, &appErr) {
		appErr = newAppError("internal_error", err.Error())
	}
	b, _ := json.Marshal(WsErrorResponse{
		ID:   id,
		Type: "error",
		Error: ErrorBody{
			Code:    appErr.Code,
			Message: appErr.Message,
		},
	})
	c.send <- b
}

func (c *Client) reply(response WsResponseMessage) {
	b, err := json.Marshal(response)
	if err != nil {
		c.replyError(response.ID, err)
		return
	}
	c.send <- b
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

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
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
