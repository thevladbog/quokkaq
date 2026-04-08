package handlers

import (
	"encoding/json"
	"net/http"
)

// RespondJSON encodes data as JSON and writes it to the response writer
// Returns true if encoding succeeded, false if there was an error
func RespondJSON(w http.ResponseWriter, data interface{}) bool {
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return false
	}
	return true
}

// RespondJSONWithStatus encodes data as JSON with a specific status code
func RespondJSONWithStatus(w http.ResponseWriter, status int, data interface{}) bool {
	w.WriteHeader(status)
	return RespondJSON(w, data)
}
