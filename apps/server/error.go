package main

import "net/http"

const (
	errForbidden      = "forbidden"
	errInvalidRequest = "invalid_request"
	errRoomNotFound   = "room_not_found"
	errUnauthorized   = "unauthorized"
	errWrongPassword  = "wrong_password"
)

type ErrorMessage struct {
	HostWrongPassword string
	InvalidSession    string
	RoomNotExist      string
	WrongPassword     string
}

var emLanguages = map[string]*ErrorMessage{
	"zh-cn": {
		HostWrongPassword: "房间已存在,密码错误",
		InvalidSession:    "会话已失效，请重新加入房间",
		RoomNotExist:      "房间不存在",
		WrongPassword:     "密码错误",
	},
	"en-us": {
		HostWrongPassword: "Room exists, wrong password",
		InvalidSession:    "Session expired, please rejoin the room",
		RoomNotExist:      "Room Not Exists",
		WrongPassword:     "Wrong Password",
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
	case errUnauthorized, errWrongPassword:
		return http.StatusUnauthorized
	case errForbidden:
		return http.StatusForbidden
	case errRoomNotFound:
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}
