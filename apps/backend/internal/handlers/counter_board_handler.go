package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"quokkaq-go-backend/internal/logger"

	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type CounterBoardHandler struct {
	survey services.SurveyService
}

func NewCounterBoardHandler(survey services.SurveyService) *CounterBoardHandler {
	return &CounterBoardHandler{survey: survey}
}

// Session godoc
// @Summary      Counter board session (terminal)
// @Description  Above-counter ticket display only. Does not load guest survey definitions and does not require the counter guest survey subscription feature.
// @Tags         guest-survey
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit id (queue scope)"
// @Success      200  {object}  services.CounterBoardSession
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @ID           counterBoardSession
// @Router       /units/{unitId}/counter-board/session [get]
func (h *CounterBoardHandler) Session(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	termID, ok := authmiddleware.GetUserIDFromContext(r.Context())
	if !ok || termID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sess, err := h.survey.CounterBoardSession(r.Context(), unitID, termID)
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
		logger.PrintfCtx(r.Context(), "counter board session: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(sess)
}
