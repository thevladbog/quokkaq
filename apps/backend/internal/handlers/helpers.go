package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
)

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
