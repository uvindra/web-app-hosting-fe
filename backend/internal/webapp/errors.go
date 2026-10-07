package webapp

import (
	"errors"
	"fmt"
)

// Code is a stable error code returned to the console.
type Code string

const (
	CodeBadRequest    Code = "BAD_REQUEST"
	CodeNotFound      Code = "NOT_FOUND"
	CodeConflict      Code = "CONFLICT"
	CodeQuotaExceeded Code = "QUOTA_EXCEEDED"
	CodeNotSupported  Code = "NOT_SUPPORTED"
)

// Error is a domain error with a code the API layer maps to an HTTP status.
type Error struct {
	Code    Code
	Message string
}

func (e *Error) Error() string { return e.Message }

func errf(code Code, format string, a ...any) error {
	return &Error{Code: code, Message: fmt.Sprintf(format, a...)}
}

// AsError returns the *Error in err's chain, if any.
func AsError(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
