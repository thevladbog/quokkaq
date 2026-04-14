package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type GuestSurveyHandler struct {
	survey services.SurveyService
}

func NewGuestSurveyHandler(survey services.SurveyService) *GuestSurveyHandler {
	return &GuestSurveyHandler{survey: survey}
}

// Session godoc
// @Summary      Guest survey session (terminal)
// @Tags         guest-survey
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit id (queue scope)"
// @Success      200  {object}  services.GuestSurveySession
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Router       /units/{unitId}/guest-survey/session [get]
func (h *GuestSurveyHandler) Session(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	termID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok || termID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sess, err := h.survey.GuestSession(unitID, termID)
	if err != nil {
		if errors.Is(err, services.ErrSurveyForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSurveyBadRequest) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSurveyFeatureLocked) {
			http.Error(w, "Feature not enabled", http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(sess)
}

type guestSurveySubmitRequest struct {
	TicketID string          `json:"ticketId"`
	SurveyID string          `json:"surveyId"`
	Answers  json.RawMessage `json:"answers" swaggertype:"object"`
}

// SubmitResponse godoc
// @Summary      Submit guest survey (terminal)
// @Tags         guest-survey
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit id"
// @Param        body body guestSurveySubmitRequest true "Payload"
// @Success      204
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Router       /units/{unitId}/guest-survey/responses [post]
func (h *GuestSurveyHandler) SubmitResponse(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	termID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok || termID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req guestSurveySubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.TicketID == "" || req.SurveyID == "" {
		http.Error(w, "ticketId and surveyId are required", http.StatusBadRequest)
		return
	}
	err := h.survey.SubmitGuestResponse(unitID, termID, req.TicketID, req.SurveyID, req.Answers)
	if err != nil {
		if errors.Is(err, services.ErrSurveyForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrSurveyBadRequest) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrSurveyNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrSurveyFeatureLocked) {
			http.Error(w, "Feature not enabled", http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
