package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"

	"quokkaq-go-backend/internal/middleware"
)

const (
	defaultQueryPageLimit = 20
	maxQueryPageLimit     = 100
)

// clampQueryPageLimit parses limit from a query string: empty or invalid → default; ≤0 → default; >max → max.
func clampQueryPageLimit(raw string) int {
	if raw == "" {
		return defaultQueryPageLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return defaultQueryPageLimit
	}
	if n <= 0 {
		return defaultQueryPageLimit
	}
	if n > maxQueryPageLimit {
		return maxQueryPageLimit
	}
	return n
}

// encodeJSONResponse marshals data to JSON in a buffer without writing to the ResponseWriter.
func encodeJSONResponse(data interface{}) ([]byte, error) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(data); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// RespondJSON encodes data as JSON and writes it to the response writer.
// Encoding is fully buffered first so the client does not receive a partial JSON body on error.
// Returns true if encoding and writing succeeded, false otherwise.
func RespondJSON(w http.ResponseWriter, data interface{}) bool {
	body, err := encodeJSONResponse(data)
	if err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return false
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(body); err != nil {
		return false
	}
	return true
}

// RespondJSONWithStatus encodes data as JSON with a specific status code.
// The status header is only sent after a successful encode, so status and body stay consistent.
func RespondJSONWithStatus(w http.ResponseWriter, status int, data interface{}) bool {
	body, err := encodeJSONResponse(data)
	if err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return false
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(body); err != nil {
		return false
	}
	return true
}

// QuotaExceededError is the standard error shape returned in HTTP 402 quota-exceeded responses.
// error and message are always present; metric is optional.
type QuotaExceededError struct {
	// Error is always "quota_exceeded".
	Error   string `json:"error"            example:"quota_exceeded"                              enums:"quota_exceeded" validate:"required"`
	Message string `json:"message"          example:"unit quota exceeded for current subscription plan" validate:"required"`
	Metric  string `json:"metric,omitempty" example:"units"`
}

// writeQuotaExceeded writes a structured HTTP 402 response for quota-exceeded errors.
// The error message is JSON-marshalled so that special characters cannot cause XSS.
func writeQuotaExceeded(w http.ResponseWriter, metric string, err error) {
	body := QuotaExceededError{
		Error:   "quota_exceeded",
		Message: err.Error(),
	}
	if metric != "" {
		body.Metric = metric
	}
	RespondJSONWithStatus(w, http.StatusPaymentRequired, body)
}

// getActorFromRequest returns a pointer to the authenticated user ID for audit fields, or nil if absent.
func getActorFromRequest(r *http.Request) *string {
	if uid, ok := middleware.GetUserIDFromContext(r.Context()); ok && uid != "" {
		u := uid
		return &u
	}
	return nil
}
