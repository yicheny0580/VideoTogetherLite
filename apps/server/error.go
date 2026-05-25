package main

import "net/http"

const (
	errForbidden         = "forbidden"
	errInvalidRequest    = "invalid_request"
	errRoomNotFound      = "room_not_found"
	errUnauthorized      = "unauthorized"
	errWrongInviteSecret = "wrong_invite_secret"
)

type ErrorMessage struct {
	InvalidSession    string
	RoomNotExist      string
	WrongInviteSecret string
}

var emLanguages = map[string]*ErrorMessage{
	"zh-cn": {
		InvalidSession:    "会话已失效，请重新加入房间",
		RoomNotExist:      "房间不存在",
		WrongInviteSecret: "邀请码错误",
	},
	"en-us": {
		InvalidSession:    "Session expired, please rejoin the room",
		RoomNotExist:      "Room Not Exists",
		WrongInviteSecret: "Wrong invite code",
	},
}

func GetErrorMessage(language string) *ErrorMessage {
	em, ok := emLanguages[language]
	if ok {
		return em
	}
	return emLanguages["en-us"]
}

type appError struct {
	Code    string
	Message string
	Status  int
}

func (e *appError) Error() string {
	return e.Message
}

func newAppError(code, message string) *appError {
	return &appError{
		Code:    code,
		Message: message,
		Status:  statusForError(code),
	}
}

func statusForError(code string) int {
	switch code {
	case errInvalidRequest:
		return http.StatusBadRequest
	case errUnauthorized, errWrongInviteSecret:
		return http.StatusUnauthorized
	case errForbidden:
		return http.StatusForbidden
	case errRoomNotFound:
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}
