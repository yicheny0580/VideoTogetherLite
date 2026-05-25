package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
)

const maxJSONBodyBytes = 1 << 20

var videoTogetherLiteVersion = secureVersion()

func Init() {
	videoTogetherLiteVersion = secureVersion()
}

type slashFix struct {
	mux         http.Handler
	liteService *VideoTogetherLiteService
}

func newSlashFix(liteService *VideoTogetherLiteService) *slashFix {
	s := &slashFix{
		liteService: liteService,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/timestamp", s.handleTimestamp)
	mux.HandleFunc("POST /api/v1/rooms/join", s.handleRoomJoin)
	mux.HandleFunc("POST /api/v1/rooms/get", s.handleRoomGet)
	mux.HandleFunc("POST /api/v1/rooms/host-update", s.handleHostUpdate)
	mux.HandleFunc("POST /api/v1/rooms/member-update", s.handleMemberUpdate)

	wsHub := newWsHub(liteService)
	go wsHub.run()
	mux.HandleFunc("GET /api/v1/ws", s.newWsHandler(wsHub))

	s.mux = mux
	return s
}

func (h *slashFix) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if e := recover(); e != nil {
			h.handleError(w, e)
		}
	}()

	r.URL.Path = strings.ReplaceAll(r.URL.Path, "//", "/")
	h.enableCors(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	slog.Info("request", "remote", r.RemoteAddr, "method", r.Method, "path", r.URL.Path)
	h.mux.ServeHTTP(w, r)
}

type TimestampResponse struct {
	Timestamp                float64 `json:"timestamp"`
	VideoTogetherLiteVersion int     `json:"videoTogetherLiteVersion"`
}

type RoomSessionResponse struct {
	Room         Room    `json:"room"`
	SessionToken string  `json:"sessionToken,omitempty"`
	Timestamp    float64 `json:"timestamp"`
}

type TimestampReplayResponse struct {
	SendLocalTimestamp     float64 `json:"sendLocalTimestamp"`
	ReceiveServerTimestamp float64 `json:"receiveServerTimestamp"`
	SendServerTimestamp    float64 `json:"sendServerTimestamp"`
}

type ErrorEnvelope struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type joinRoomRequest struct {
	Name     string `json:"name"`
	Password string `json:"password"`
	UserID   string `json:"userId"`
}

type getRoomRequest struct {
	Name         string `json:"name"`
	SessionToken string `json:"sessionToken"`
}

type hostUpdateRequest struct {
	CurrentTime          float64 `json:"currentTime"`
	Duration             float64 `json:"duration"`
	LastUpdateClientTime float64 `json:"lastUpdateClientTime"`
	Name                 string  `json:"name"`
	Password             string  `json:"password,omitempty"`
	Paused               bool    `json:"paused"`
	PlaybackRate         float64 `json:"playbackRate"`
	Protected            bool    `json:"protected"`
	SendLocalTimestamp   float64 `json:"sendLocalTimestamp"`
	SessionToken         string  `json:"sessionToken,omitempty"`
	URL                  string  `json:"url"`
	UserID               string  `json:"userId"`
	VideoTitle           string  `json:"videoTitle"`
}

type memberUpdateRequest struct {
	CurrentURL         string  `json:"currentUrl"`
	IsLoading          bool    `json:"isLoading"`
	RoomName           string  `json:"roomName"`
	SendLocalTimestamp float64 `json:"sendLocalTimestamp"`
	SessionToken       string  `json:"sessionToken"`
	UserID             string  `json:"userId"`
}

func (h *slashFix) handleTimestamp(w http.ResponseWriter, _ *http.Request) {
	h.JSON(w, http.StatusOK, TimestampResponse{
		Timestamp:                h.liteService.Timestamp(),
		VideoTogetherLiteVersion: videoTogetherLiteVersion,
	})
}

func (h *slashFix) handleRoomJoin(w http.ResponseWriter, req *http.Request) {
	var body joinRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, err := h.liteService.JoinRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), JoinRoomInput{
		Password: body.Password,
		RoomName: body.Name,
		UserID:   body.UserID,
	})
	h.respondResult(w, result, err)
}

func (h *slashFix) handleRoomGet(w http.ResponseWriter, req *http.Request) {
	var body getRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, err := h.liteService.GetRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), GetRoomInput{
		RoomName:     body.Name,
		SessionToken: body.SessionToken,
	})
	h.respondResult(w, result, err)
}

func (h *slashFix) handleHostUpdate(w http.ResponseWriter, req *http.Request) {
	var body hostUpdateRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	if err := validateHostUpdate(body); err != nil {
		h.respondError(w, err)
		return
	}
	result, err := h.liteService.HostUpdateRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), HostUpdateInput{
		CurrentTime:          body.CurrentTime,
		Duration:             body.Duration,
		LastUpdateClientTime: body.LastUpdateClientTime,
		Password:             body.Password,
		Paused:               body.Paused,
		PlaybackRate:         body.PlaybackRate,
		Protected:            body.Protected,
		RoomName:             body.Name,
		SessionToken:         body.SessionToken,
		URL:                  body.URL,
		UserID:               body.UserID,
		VideoTitle:           body.VideoTitle,
	})
	h.respondResult(w, result, err)
}

func (h *slashFix) handleMemberUpdate(w http.ResponseWriter, req *http.Request) {
	var body memberUpdateRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, _, err := h.liteService.UpdateMember(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), MemberUpdateInput{
		CurrentURL:   body.CurrentURL,
		IsLoading:    body.IsLoading,
		RoomName:     body.RoomName,
		SessionToken: body.SessionToken,
		UserID:       body.UserID,
	})
	h.respondResult(w, result, err)
}

func (h *slashFix) decodeJSON(w http.ResponseWriter, req *http.Request, dest interface{}) bool {
	if req.Body == nil {
		h.respondError(w, newAppError(errInvalidRequest, "request body is required"))
		return false
	}
	defer req.Body.Close()

	decoder := json.NewDecoder(http.MaxBytesReader(w, req.Body, maxJSONBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		h.respondError(w, newAppError(errInvalidRequest, "invalid JSON body"))
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		h.respondError(w, newAppError(errInvalidRequest, "request body must contain one JSON value"))
		return false
	}
	return true
}

func (h *slashFix) respondResult(w http.ResponseWriter, result RoomSessionResult, err error) {
	if err != nil {
		h.respondError(w, err)
		return
	}
	h.JSON(w, http.StatusOK, RoomSessionResponse{
		Room:         result.Room,
		SessionToken: result.SessionToken,
		Timestamp:    result.Timestamp,
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
	h.respondError(res, newAppError("internal_error", fmt.Sprintf("%v", e)))
}

func (h *slashFix) respondError(w io.Writer, err error) {
	var appErr *appError
	if !errors.As(err, &appErr) {
		appErr = newAppError("internal_error", err.Error())
	}
	h.JSON(w, appErr.Status, ErrorEnvelope{
		Error: ErrorBody{
			Code:    appErr.Code,
			Message: appErr.Message,
		},
	})
}

func (h *slashFix) enableCors(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
}

func validateHostUpdate(body hostUpdateRequest) error {
	if body.Name == "" {
		return newAppError(errInvalidRequest, "name is required")
	}
	if body.SessionToken == "" && body.Password == "" {
		return newAppError(errInvalidRequest, "password or sessionToken is required")
	}
	if !isFinite(body.CurrentTime) || !isFinite(body.Duration) || !isFinite(body.LastUpdateClientTime) || !isFinite(body.PlaybackRate) {
		return newAppError(errInvalidRequest, "numeric fields must be finite")
	}
	return nil
}

func isFinite(num float64) bool {
	return !math.IsNaN(num) && !math.IsInf(num, 0)
}
