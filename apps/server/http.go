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
	liteService  *VideoTogetherLiteService
	mux          http.Handler
	originPolicy *originPolicy
}

func newSlashFix(liteService *VideoTogetherLiteService, policies ...*originPolicy) *slashFix {
	policy := newOriginPolicy([]string{"*"})
	if len(policies) > 0 && policies[0] != nil {
		policy = policies[0]
	}
	s := &slashFix{
		liteService:  liteService,
		originPolicy: policy,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /api/v1/timestamp", s.handleTimestamp)
	mux.HandleFunc("POST /api/v1/rooms/create", s.handleRoomCreate)
	mux.HandleFunc("POST /api/v1/rooms/join", s.handleRoomJoin)
	mux.HandleFunc("POST /api/v1/rooms/get", s.handleRoomGet)
	mux.HandleFunc("POST /api/v1/rooms/leave", s.handleRoomLeave)
	mux.HandleFunc("POST /api/v1/rooms/update", s.handleRoomUpdate)

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
	if !h.enableCors(w, r) {
		h.respondError(w, newAppError(errForbidden, "origin is not allowed"))
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	slog.Info("request", "remote", r.RemoteAddr, "method", r.Method, "path", r.URL.Path)
	h.mux.ServeHTTP(w, r)
}

type TimestampResponse struct {
	Timestamp                float64 `json:"timestamp"`
	VideoTogetherLiteVersion int     `json:"videoTogetherLiteVersion,omitempty"`
}

type HealthResponse struct {
	Status                   string  `json:"status"`
	Timestamp                float64 `json:"timestamp"`
	VideoTogetherLiteVersion int     `json:"videoTogetherLiteVersion,omitempty"`
}

type RoomSessionResponse struct {
	InviteCode   string  `json:"inviteCode,omitempty"`
	InviteSecret string  `json:"inviteSecret,omitempty"`
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

type createRoomRequest struct {
	Nickname string `json:"nickname"`
	UserID   string `json:"userId"`
}

type joinRoomRequest struct {
	InviteCode   string `json:"inviteCode,omitempty"`
	InviteSecret string `json:"inviteSecret,omitempty"`
	Nickname     string `json:"nickname"`
	RoomCode     string `json:"roomCode,omitempty"`
	UserID       string `json:"userId"`
}

type getRoomRequest struct {
	SessionToken string `json:"sessionToken"`
}

type leaveRoomRequest struct {
	SessionToken string `json:"sessionToken"`
}

type updateRoomRequest struct {
	FocusedVideo       *SharedVideoState `json:"focusedVideo,omitempty"`
	Nickname           string            `json:"nickname,omitempty"`
	SendLocalTimestamp float64           `json:"sendLocalTimestamp"`
	SessionToken       string            `json:"sessionToken"`
	Sharing            bool              `json:"sharing"`
}

func (h *slashFix) handleTimestamp(w http.ResponseWriter, _ *http.Request) {
	h.JSON(w, http.StatusOK, TimestampResponse{
		Timestamp:                h.liteService.Timestamp(),
		VideoTogetherLiteVersion: videoTogetherLiteVersion,
	})
}

func (h *slashFix) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	h.JSON(w, http.StatusOK, HealthResponse{
		Status:                   "ok",
		Timestamp:                h.liteService.Timestamp(),
		VideoTogetherLiteVersion: videoTogetherLiteVersion,
	})
}

func (h *slashFix) handleRoomCreate(w http.ResponseWriter, req *http.Request) {
	var body createRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, err := h.liteService.CreateRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), CreateRoomInput{
		Nickname: body.Nickname,
		UserID:   body.UserID,
	})
	h.respondRoomResult(w, result, err)
}

func (h *slashFix) handleRoomJoin(w http.ResponseWriter, req *http.Request) {
	var body joinRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, err := h.liteService.JoinRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), JoinRoomInput{
		InviteCode:   body.InviteCode,
		InviteSecret: body.InviteSecret,
		Nickname:     body.Nickname,
		RoomCode:     body.RoomCode,
		UserID:       body.UserID,
	})
	h.respondRoomResult(w, result, err)
}

func (h *slashFix) handleRoomGet(w http.ResponseWriter, req *http.Request) {
	var body getRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, err := h.liteService.GetRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), GetRoomInput{
		SessionToken: body.SessionToken,
	})
	h.respondRoomResult(w, result, err)
}

func (h *slashFix) handleRoomLeave(w http.ResponseWriter, req *http.Request) {
	var body leaveRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	result, _, err := h.liteService.LeaveRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), LeaveRoomInput{
		SessionToken: body.SessionToken,
	})
	if err != nil {
		h.respondError(w, err)
		return
	}
	h.JSON(w, http.StatusOK, TimestampResponse{Timestamp: result.Timestamp})
}

func (h *slashFix) handleRoomUpdate(w http.ResponseWriter, req *http.Request) {
	var body updateRoomRequest
	if !h.decodeJSON(w, req, &body) {
		return
	}
	if err := validateRoomUpdate(body); err != nil {
		h.respondError(w, err)
		return
	}
	result, err := h.liteService.UpdateRoom(NewVideoTogetherLiteContext(req.URL.Query().Get("language")), UpdateRoomInput{
		FocusedVideo:  body.FocusedVideo,
		Nickname:      body.Nickname,
		SendLocalTime: body.SendLocalTimestamp,
		SessionToken:  body.SessionToken,
		Sharing:       body.Sharing,
	})
	h.respondRoomResult(w, result, err)
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

func (h *slashFix) respondRoomResult(w http.ResponseWriter, result RoomSessionResult, err error) {
	if err != nil {
		h.respondError(w, err)
		return
	}
	h.JSON(w, http.StatusOK, RoomSessionResponse{
		InviteCode:   result.InviteCode,
		InviteSecret: result.InviteSecret,
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

func (h *slashFix) enableCors(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	corsOrigin, ok := h.originPolicy.corsOrigin(origin)
	if !ok {
		return false
	}
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	w.Header().Set("Access-Control-Max-Age", "86400")
	if corsOrigin != "" {
		w.Header().Set("Access-Control-Allow-Origin", corsOrigin)
		if corsOrigin != "*" {
			w.Header().Add("Vary", "Origin")
		}
	}
	return true
}

func validateRoomUpdate(body updateRoomRequest) error {
	if body.SessionToken == "" {
		return newAppError(errInvalidRequest, "sessionToken is required")
	}
	if body.Sharing && body.FocusedVideo == nil {
		return newAppError(errInvalidRequest, "focusedVideo is required when sharing")
	}
	if !isFinite(body.SendLocalTimestamp) {
		return newAppError(errInvalidRequest, "numeric fields must be finite")
	}
	if body.FocusedVideo == nil {
		return nil
	}
	video := body.FocusedVideo
	if !isFinite(video.CurrentTime) || !isFinite(video.Duration) || !isFinite(video.LastUpdateClientTime) || !isFinite(video.PlaybackRate) {
		return newAppError(errInvalidRequest, "numeric fields must be finite")
	}
	return nil
}

func isFinite(num float64) bool {
	return !math.IsNaN(num) && !math.IsInf(num, 0)
}
