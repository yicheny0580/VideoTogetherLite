package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strings"
)

var vtVersion = randInt(0, 1e9)
var adminPassword = randomString(30)

func Init() {
	vtVersion = randInt(0, 1e9)
	adminPassword = randomString(30)
}

func randomString(l int) string {
	bytes := make([]byte, l)
	for i := 0; i < l; i++ {
		bytes[i] = byte(randInt(65, 90))
	}
	return string(bytes)
}

func randInt(min int, max int) int {
	return min + rand.Intn(max-min)
}

type slashFix struct {
	mux   http.Handler
	vtSrv *VideoTogetherService
}

func newSlashFix(vtSrv *VideoTogetherService) *slashFix {
	s := &slashFix{
		vtSrv: vtSrv,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/room/get", s.handleRoomGet)
	mux.HandleFunc("/timestamp", s.handleTimestamp)
	mux.HandleFunc("/room/update", s.handleRoomUpdate)

	wsHub := newWsHub(vtSrv)
	go wsHub.run()
	mux.HandleFunc("/ws", s.newWsHandler(wsHub))

	s.mux = mux
	return s
}

func (h *slashFix) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if e := recover(); e != nil {
			h.handleError(w, e)
		}
	}()

	r.URL.Path = strings.Replace(r.URL.Path, "//", "/", -1)
	h.enableCors(w)
	if r.Method == "OPTIONS" {
		return
	}
	log.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
	h.mux.ServeHTTP(w, r)
}

type TimestampResponse struct {
	Timestamp float64 `json:"timestamp"`
}

type TimestampExtendedResponse struct {
	Timestamp float64 `json:"timestamp"`
	VtVersion int     `json:"vtVersion"`
}

type RoomResponse struct {
	*Room
	*TimestampResponse
}

type TimestampV2Response struct {
	SendLocalTimestamp     float64 `json:"sendLocalTimestamp"`
	ReceiveServerTimestamp float64 `json:"receiveServerTimestamp"`
	SendServerTimestamp    float64 `json:"sendServerTimestamp"`
}

func (h *slashFix) newRoomResponse(room *Room) *RoomResponse {
	return &RoomResponse{
		TimestampResponse: &TimestampResponse{Timestamp: h.vtSrv.Timestamp()},
		Room:              room,
	}
}

func (h *slashFix) handleRoomUpdate(res http.ResponseWriter, req *http.Request) {
	userId := req.URL.Query().Get("tempUser")
	name := req.URL.Query().Get("name")
	password := GetMD5Hash(req.URL.Query().Get("password"))
	language := req.URL.Query().Get("language")

	room, err := h.vtSrv.GetAndCheckUpdatePermissionsOfRoom(NewVtContext(language, req.RemoteAddr), name, password, userId)
	if err != nil {
		h.respondError(res, err.Error())
		return
	}

	room.PlaybackRate = floatParam(req, "playbackRate", p(float64(1)))
	room.CurrentTime = floatParam(req, "currentTime", nil)
	room.Paused = req.URL.Query().Get("paused") != "false"
	room.Url = req.URL.Query().Get("url")
	room.LastUpdateClientTime = floatParam(req, "lastUpdateClientTime", nil)
	room.Duration = floatParam(req, "duration", p(1e9))
	room.LastUpdateServerTime = h.vtSrv.Timestamp()
	room.Protected = req.URL.Query().Get("protected") == "true"
	room.VideoTitle = req.URL.Query().Get("videoTitle")

	h.JSON(res, 200, h.newRoomResponse(room))
}

func (h *slashFix) handleRoomGet(res http.ResponseWriter, req *http.Request) {
	password := GetMD5Hash(req.URL.Query().Get("password"))
	name := req.URL.Query().Get("name")
	language := req.URL.Query().Get("language")
	room := h.vtSrv.QueryRoom(name)
	if room == nil {
		h.respondError(res, GetErrorMessage(language).RoomNotExist)
		return
	}
	if !room.HasAccess(password) {
		h.respondError(res, GetErrorMessage(language).WrongPassword)
		return
	}
	h.JSON(res, 200, h.newRoomResponse(room))
}

func (h *slashFix) handleTimestamp(res http.ResponseWriter, req *http.Request) {
	h.JSON(res, 200, TimestampExtendedResponse{
		Timestamp: h.vtSrv.Timestamp(),
		VtVersion: vtVersion,
	})
}

func (h *slashFix) JSON(w io.Writer, status int, v interface{}) {
	if res, ok := w.(http.ResponseWriter); ok {
		res.Header().Set("Content-Type", "application/json; charset=utf-8")
		res.WriteHeader(status)
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		panic(err)
	}
}

func (h *slashFix) handleError(res http.ResponseWriter, e interface{}) {
	switch e := e.(type) {
	case string:
		http.Error(res, e, http.StatusInternalServerError)
	case interface{ String() string }:
		http.Error(res, e.String(), http.StatusInternalServerError)
	case error:
		http.Error(res, e.Error(), http.StatusInternalServerError)
	case []byte:
		http.Error(res, string(e), http.StatusInternalServerError)
	default:
		http.Error(res, fmt.Sprintf("%v", e), http.StatusInternalServerError)
	}
}

type ErrorResponse struct {
	ErrorMessage string `json:"errorMessage"`
}

func (h *slashFix) respondError(w io.Writer, errorMessage string) {
	h.JSON(w, 200, &ErrorResponse{
		ErrorMessage: errorMessage,
	})
}

func (h *slashFix) enableCors(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.Header().Set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS")
}
