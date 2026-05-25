package main

import (
	"encoding/json"
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

func TestRoomUpdateAndGet(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	updateURL := server.URL + "/room/update?name=room-a&password=pw&playbackRate=1.25&currentTime=12.5&paused=false&url=https%3A%2F%2Fexample.test%2Fwatch&lastUpdateClientTime=100&duration=600&tempUser=host-1&protected=true&videoTitle=Example"
	updateResp, err := server.Client().Get(updateURL)
	if err != nil {
		t.Fatal(err)
	}
	defer updateResp.Body.Close()

	var updated RoomResponse
	if err := json.NewDecoder(updateResp.Body).Decode(&updated); err != nil {
		t.Fatal(err)
	}
	if updated.Name != "room-a" || updated.CurrentTime != 12.5 || updated.Paused {
		t.Fatalf("unexpected updated room: %+v", updated.Room)
	}
	if updated.Url != "https://example.test/watch" || !updated.Protected {
		t.Fatalf("room URL/protection not stored: %+v", updated.Room)
	}

	getResp, err := server.Client().Get(server.URL + "/room/get?name=room-a&password=pw")
	if err != nil {
		t.Fatal(err)
	}
	defer getResp.Body.Close()

	var got RoomResponse
	if err := json.NewDecoder(getResp.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.Name != "room-a" || got.PlaybackRate != 1.25 {
		t.Fatalf("unexpected fetched room: %+v", got.Room)
	}
}

func TestProtectedRoomRejectsWrongPassword(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	_, err := server.Client().Get(server.URL + "/room/update?name=room-b&password=pw&playbackRate=1&currentTime=0&paused=true&url=https%3A%2F%2Fexample.test&lastUpdateClientTime=1&duration=100&tempUser=host-1&protected=true")
	if err != nil {
		t.Fatal(err)
	}

	resp, err := server.Client().Get(server.URL + "/room/get?name=room-b&password=wrong")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var body ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.ErrorMessage != GetErrorMessage("").WrongPassword {
		t.Fatalf("expected wrong password error, got %q", body.ErrorMessage)
	}
}

func TestWebSocketRoomBroadcast(t *testing.T) {
	server, _ := newTestServer()
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
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

	hostUpdate := `{"method":"/room/update","data":{"tempUser":"host-1","password":"pw","name":"room-c","playbackRate":1,"currentTime":10,"paused":true,"url":"https://example.test/watch","lastUpdateClientTime":1,"duration":120,"protected":true,"videoTitle":"Example","sendLocalTimestamp":1}}`
	if err := hostConn.WriteMessage(websocket.TextMessage, []byte(hostUpdate)); err != nil {
		t.Fatal(err)
	}
	readMethod(t, hostConn, "/room/update")

	memberJoin := `{"method":"/room/join","data":{"name":"room-c","password":"pw"}}`
	if err := memberConn.WriteMessage(websocket.TextMessage, []byte(memberJoin)); err != nil {
		t.Fatal(err)
	}
	readMethod(t, memberConn, "/room/join")

	hostUpdate = `{"method":"/room/update","data":{"tempUser":"host-1","password":"pw","name":"room-c","playbackRate":1,"currentTime":35,"paused":false,"url":"https://example.test/watch","lastUpdateClientTime":2,"duration":120,"protected":true,"videoTitle":"Example","sendLocalTimestamp":2}}`
	if err := hostConn.WriteMessage(websocket.TextMessage, []byte(hostUpdate)); err != nil {
		t.Fatal(err)
	}
	msg := readMethod(t, memberConn, "/room/update")
	if msg.Data.Room.CurrentTime != 35 || msg.Data.Room.Paused {
		t.Fatalf("unexpected broadcast room: %+v", msg.Data.Room)
	}
}

func readMethod(t *testing.T, conn *websocket.Conn, method string) WsRoomResponse {
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
		for _, line := range strings.Split(string(body), "\n") {
			var msg WsRoomResponse
			if err := json.Unmarshal([]byte(line), &msg); err != nil {
				continue
			}
			if msg.Method == method {
				return msg
			}
		}
	}
}
