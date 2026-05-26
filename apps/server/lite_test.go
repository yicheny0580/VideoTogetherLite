package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func newTestServer() (*httptest.Server, *VideoTogetherLiteService) {
	Init()
	liteService := NewVideoTogetherLiteService(time.Minute)
	api := newSlashFix(liteService)
	return httptest.NewServer(api), liteService
}

func TestHealthz(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	response, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected health ok, got %d", response.StatusCode)
	}

	var body HealthResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" || body.Timestamp == 0 {
		t.Fatalf("unexpected health response: %+v", body)
	}
}

func TestCorsOriginPolicy(t *testing.T) {
	Init()
	service := NewVideoTogetherLiteService(time.Minute)
	api := newSlashFix(service, newOriginPolicy([]string{"https://allowed.example"}))
	server := httptest.NewServer(api)
	defer server.Close()

	request, err := http.NewRequest(http.MethodOptions, server.URL+"/api/v1/timestamp", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", "https://blocked.example")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden preflight, got %d", response.StatusCode)
	}

	request, err = http.NewRequest(http.MethodOptions, server.URL+"/api/v1/timestamp", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", "https://allowed.example")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("expected no content preflight, got %d", response.StatusCode)
	}
	if response.Header.Get("Access-Control-Allow-Origin") != "https://allowed.example" {
		t.Fatalf("unexpected CORS origin: %q", response.Header.Get("Access-Control-Allow-Origin"))
	}
}

func TestCreateJoinAndGetWithInviteCode(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)

	if created.SessionToken == "" || created.InviteCode == "" || created.InviteSecret == "" {
		t.Fatalf("expected session and invite data: %+v", created)
	}
	if created.Room.ParticipantCount != 1 || created.Room.Participants[0].Nickname != "Alice" {
		t.Fatalf("unexpected created room: %+v", created.Room)
	}

	joined := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/join", joinRoomRequest{
		InviteCode: created.InviteCode,
		Nickname:   "Bob",
		UserID:     "user-2",
	}, http.StatusOK)
	if joined.Room.RoomCode != created.Room.RoomCode || joined.Room.ParticipantCount != 2 {
		t.Fatalf("unexpected joined room: %+v", joined.Room)
	}

	got := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/get", getRoomRequest{
		SessionToken: joined.SessionToken,
	}, http.StatusOK)
	if got.Room.ParticipantCount != 2 || got.SessionToken != "" {
		t.Fatalf("unexpected fetched room: %+v", got)
	}
}

func TestJoinRejectsWrongInviteSecret(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)

	body := postJSON[ErrorEnvelope](t, server, "/api/v1/rooms/join", joinRoomRequest{
		InviteSecret: "wrong",
		Nickname:     "Bob",
		RoomCode:     created.Room.RoomCode,
		UserID:       "user-2",
	}, http.StatusUnauthorized)
	if body.Error.Code != errWrongInviteSecret || body.Error.Message != GetErrorMessage("").WrongInviteSecret {
		t.Fatalf("unexpected error: %+v", body.Error)
	}
}

func TestUserCanOnlyBeInOneRoom(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	first := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)
	second := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)

	postJSON[ErrorEnvelope](t, server, "/api/v1/rooms/get", getRoomRequest{
		SessionToken: first.SessionToken,
	}, http.StatusUnauthorized)

	got := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/get", getRoomRequest{
		SessionToken: second.SessionToken,
	}, http.StatusOK)
	if got.Room.RoomCode != second.Room.RoomCode || got.Room.ParticipantCount != 1 {
		t.Fatalf("unexpected active room: %+v", got.Room)
	}
}

func TestLeaveDeletesEmptyRoom(t *testing.T) {
	server, service := newTestServer()
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)
	postJSON[TimestampResponse](t, server, "/api/v1/rooms/leave", leaveRoomRequest{
		SessionToken: created.SessionToken,
	}, http.StatusOK)

	if service.RoomExists(created.Room.RoomCode) {
		t.Fatalf("expected empty room to be deleted")
	}
}

func TestUpdatePublishesSharedVideoOnlyWhenSharing(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)

	notSharing := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/update", updateRoomRequest{
		FocusedVideo:       sampleVideoState(12),
		Nickname:           "Alice",
		SendLocalTimestamp: 2,
		SessionToken:       created.SessionToken,
		Sharing:            false,
	}, http.StatusOK)
	alice := findParticipant(t, notSharing.Room, "user-1")
	if alice.FocusedVideo != nil || alice.Sharing {
		t.Fatalf("focus without sharing should not publish video: %+v", alice)
	}

	sharing := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/update", updateRoomRequest{
		FocusedVideo:       sampleVideoState(24),
		Nickname:           "Alice Cooper",
		SendLocalTimestamp: 3,
		SessionToken:       created.SessionToken,
		Sharing:            true,
	}, http.StatusOK)
	alice = findParticipant(t, sharing.Room, "user-1")
	if !alice.Sharing || alice.FocusedVideo == nil || alice.FocusedVideo.CurrentTime != 24 || alice.Nickname != "Alice Cooper" {
		t.Fatalf("shared video not reflected: %+v", alice)
	}
}

func TestExpiredParticipantsDeleteRoom(t *testing.T) {
	Init()
	service := NewVideoTogetherLiteService(time.Millisecond)
	api := newSlashFix(service)
	server := httptest.NewServer(api)
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)
	time.Sleep(3 * time.Millisecond)
	service.RemoveExpiredRooms()

	if service.RoomExists(created.Room.RoomCode) {
		t.Fatalf("expected stale room to be deleted")
	}
}

func TestWebSocketParticipantBroadcast(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/create", createRoomRequest{
		Nickname: "Alice",
		UserID:   "user-1",
	}, http.StatusOK)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/ws"
	aliceConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer aliceConn.Close()

	bobConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer bobConn.Close()

	writeWS(t, aliceConn, WsRequestMessage{
		ID:   "get-1",
		Type: "room.get",
		Data: mustJSON(t, getRoomRequest{SessionToken: created.SessionToken}),
	})
	readWSType(t, aliceConn, "room.get")

	writeWS(t, bobConn, WsRequestMessage{
		ID:   "join-1",
		Type: "room.join",
		Data: mustJSON(t, joinRoomRequest{InviteCode: created.InviteCode, Nickname: "Bob", UserID: "user-2"}),
	})
	joinMsg := readWSType(t, bobConn, "room.join")
	readWSType(t, aliceConn, "room.updated")

	var joined RoomSessionResponse
	if err := json.Unmarshal(joinMsg.Data, &joined); err != nil {
		t.Fatal(err)
	}

	writeWS(t, bobConn, WsRequestMessage{
		ID:   "update-1",
		Type: "room.update",
		Data: mustJSON(t, updateRoomRequest{
			FocusedVideo:       sampleVideoState(35),
			Nickname:           "Bob",
			SendLocalTimestamp: 2,
			SessionToken:       joined.SessionToken,
			Sharing:            true,
		}),
	})
	readWSType(t, bobConn, "room.update")
	msg := readWSType(t, aliceConn, "room.updated")
	var body RoomSessionResponse
	if err := json.Unmarshal(msg.Data, &body); err != nil {
		t.Fatal(err)
	}
	bob := findParticipant(t, body.Room, "user-2")
	if !bob.Sharing || bob.FocusedVideo == nil || bob.FocusedVideo.CurrentTime != 35 {
		t.Fatalf("unexpected broadcast room: %+v", body.Room)
	}
}

type wsTestMessage struct {
	Data  json.RawMessage `json:"data"`
	Error *ErrorBody      `json:"error"`
	ID    string          `json:"id"`
	Type  string          `json:"type"`
}

func sampleVideoState(currentTime float64) *SharedVideoState {
	return &SharedVideoState{
		CurrentTime:          currentTime,
		Duration:             120,
		IsLoading:            false,
		LastUpdateClientTime: 1,
		Paused:               true,
		PlaybackRate:         1,
		Title:                "Example",
		URL:                  "https://example.test/watch",
	}
}

func findParticipant(t *testing.T, room Room, userID string) RoomParticipant {
	t.Helper()
	for _, participant := range room.Participants {
		if participant.UserID == userID {
			return participant
		}
	}
	t.Fatalf("participant %q not found in %+v", userID, room)
	return RoomParticipant{}
}

func postJSON[T any](t *testing.T, server *httptest.Server, path string, request interface{}, status int) T {
	t.Helper()

	body, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := server.Client().Post(server.URL+path, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != status {
		t.Fatalf("expected HTTP %d, got %d", status, resp.StatusCode)
	}

	var decoded T
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

func mustJSON(t *testing.T, value interface{}) json.RawMessage {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func writeWS(t *testing.T, conn *websocket.Conn, message WsRequestMessage) {
	t.Helper()
	body, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, body); err != nil {
		t.Fatal(err)
	}
}

func readWSType(t *testing.T, conn *websocket.Conn, messageType string) wsTestMessage {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	if err := conn.SetReadDeadline(deadline); err != nil {
		t.Fatal(err)
	}
	for {
		_, body, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		var msg wsTestMessage
		if err := json.Unmarshal(body, &msg); err != nil {
			t.Fatal(err)
		}
		if msg.Error != nil {
			t.Fatalf("unexpected websocket error: %+v", *msg.Error)
		}
		if msg.Type == messageType {
			return msg
		}
	}
}
