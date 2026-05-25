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

func newTestServer() (*httptest.Server, *VideoTogetherService) {
	Init()
	vtSrv := NewVideoTogetherService(time.Minute)
	api := newSlashFix(vtSrv)
	return httptest.NewServer(api), vtSrv
}

func TestHostUpdateAndGetWithToken(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	created := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          12.5,
		Duration:             600,
		LastUpdateClientTime: 100,
		Name:                 "room-a",
		Password:             "pw",
		Paused:               false,
		PlaybackRate:         1.25,
		Protected:            true,
		URL:                  "https://example.test/watch",
		UserID:               "host-1",
		VideoTitle:           "Example",
	}, http.StatusOK)

	if created.SessionToken == "" {
		t.Fatal("expected host session token")
	}
	if created.Room.Name != "room-a" || created.Room.CurrentTime != 12.5 || created.Room.Paused {
		t.Fatalf("unexpected updated room: %+v", created.Room)
	}
	if created.Room.URL != "https://example.test/watch" || !created.Room.Protected {
		t.Fatalf("room URL/protection not stored: %+v", created.Room)
	}

	got := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/get", getRoomRequest{
		Name:         "room-a",
		SessionToken: created.SessionToken,
	}, http.StatusOK)
	if got.Room.Name != "room-a" || got.Room.PlaybackRate != 1.25 {
		t.Fatalf("unexpected fetched room: %+v", got.Room)
	}
	if got.SessionToken != "" {
		t.Fatalf("get should not rotate token, got %q", got.SessionToken)
	}
}

func TestProtectedRoomRejectsWrongPassword(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          0,
		Duration:             100,
		LastUpdateClientTime: 1,
		Name:                 "room-b",
		Password:             "pw",
		Paused:               true,
		PlaybackRate:         1,
		Protected:            true,
		URL:                  "https://example.test",
		UserID:               "host-1",
	}, http.StatusOK)

	body := postJSON[ErrorEnvelope](t, server, "/api/v1/rooms/join", joinRoomRequest{
		Name:     "room-b",
		Password: "wrong",
		UserID:   "member-1",
	}, http.StatusUnauthorized)
	if body.Error.Code != errWrongPassword || body.Error.Message != GetErrorMessage("").WrongPassword {
		t.Fatalf("unexpected error: %+v", body.Error)
	}
}

func TestHostClaimInvalidatesOldHostToken(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	first := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          1,
		Duration:             100,
		LastUpdateClientTime: 1,
		Name:                 "room-c",
		Password:             "pw",
		Paused:               true,
		PlaybackRate:         1,
		Protected:            true,
		URL:                  "https://example.test",
		UserID:               "host-1",
	}, http.StatusOK)
	second := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          2,
		Duration:             100,
		LastUpdateClientTime: 2,
		Name:                 "room-c",
		Password:             "pw",
		Paused:               false,
		PlaybackRate:         1,
		Protected:            true,
		URL:                  "https://example.test",
		UserID:               "host-2",
	}, http.StatusOK)

	postJSON[ErrorEnvelope](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          3,
		Duration:             100,
		LastUpdateClientTime: 3,
		Name:                 "room-c",
		Paused:               false,
		PlaybackRate:         1,
		Protected:            true,
		SessionToken:         first.SessionToken,
		URL:                  "https://example.test",
		UserID:               "host-1",
	}, http.StatusUnauthorized)

	updated := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          4,
		Duration:             100,
		LastUpdateClientTime: 4,
		Name:                 "room-c",
		Paused:               false,
		PlaybackRate:         1,
		Protected:            true,
		SessionToken:         second.SessionToken,
		URL:                  "https://example.test",
		UserID:               "host-2",
	}, http.StatusOK)
	if updated.Room.CurrentTime != 4 {
		t.Fatalf("new host token did not update room: %+v", updated.Room)
	}
}

func TestMemberUpdateChangesLoadingState(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	host := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          10,
		Duration:             120,
		LastUpdateClientTime: 1,
		Name:                 "room-d",
		Password:             "pw",
		Paused:               false,
		PlaybackRate:         1,
		Protected:            true,
		URL:                  "https://example.test/watch",
		UserID:               "host-1",
	}, http.StatusOK)
	member := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/join", joinRoomRequest{
		Name:     "room-d",
		Password: "pw",
		UserID:   "member-1",
	}, http.StatusOK)

	updated := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/member-update", memberUpdateRequest{
		CurrentURL:         "https://example.test/watch",
		IsLoading:          true,
		RoomName:           "room-d",
		SendLocalTimestamp: 2,
		SessionToken:       member.SessionToken,
		UserID:             "member-1",
	}, http.StatusOK)
	if !updated.Room.WaitForLoading || updated.Room.MemberCount != 2 {
		t.Fatalf("member loading data not reflected: %+v", updated.Room)
	}

	got := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/get", getRoomRequest{
		Name:         "room-d",
		SessionToken: host.SessionToken,
	}, http.StatusOK)
	if got.Room.BeginLoadingTimestamp == 0 {
		t.Fatalf("expected loading timestamp after query: %+v", got.Room)
	}
}

func TestWebSocketRoomBroadcast(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	host := postJSON[RoomSessionResponse](t, server, "/api/v1/rooms/host-update", hostUpdateRequest{
		CurrentTime:          10,
		Duration:             120,
		LastUpdateClientTime: 1,
		Name:                 "room-e",
		Password:             "pw",
		Paused:               true,
		PlaybackRate:         1,
		Protected:            true,
		URL:                  "https://example.test/watch",
		UserID:               "host-1",
	}, http.StatusOK)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/ws"
	hostConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer hostConn.Close()

	memberConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer memberConn.Close()

	writeWS(t, memberConn, WsRequestMessage{
		ID:   "join-1",
		Type: "room.join",
		Data: mustJSON(t, joinRoomRequest{Name: "room-e", Password: "pw", UserID: "member-1"}),
	})
	readWSType(t, memberConn, "room.join")

	writeWS(t, hostConn, WsRequestMessage{
		ID:   "update-1",
		Type: "room.hostUpdate",
		Data: mustJSON(t, hostUpdateRequest{
			CurrentTime:          35,
			Duration:             120,
			LastUpdateClientTime: 2,
			Name:                 "room-e",
			Paused:               false,
			PlaybackRate:         1,
			Protected:            true,
			SessionToken:         host.SessionToken,
			URL:                  "https://example.test/watch",
			UserID:               "host-1",
			VideoTitle:           "Example",
		}),
	})
	readWSType(t, hostConn, "room.hostUpdate")
	msg := readWSType(t, memberConn, "room.updated")
	var body RoomSessionResponse
	if err := json.Unmarshal(msg.Data, &body); err != nil {
		t.Fatal(err)
	}
	if body.Room.CurrentTime != 35 || body.Room.Paused {
		t.Fatalf("unexpected broadcast room: %+v", body.Room)
	}
}

type wsTestMessage struct {
	Data  json.RawMessage `json:"data"`
	Error *ErrorBody      `json:"error"`
	ID    string          `json:"id"`
	Type  string          `json:"type"`
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
