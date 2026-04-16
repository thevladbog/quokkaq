package handlers

import (
	"encoding/json"
	"net/http"

	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type CalendarIntegrationHandler struct {
	svc *services.CalendarIntegrationService
}

func NewCalendarIntegrationHandler(svc *services.CalendarIntegrationService) *CalendarIntegrationHandler {
	return &CalendarIntegrationHandler{svc: svc}
}

// Get godoc
// @Summary      Get calendar integration settings for a unit
// @Tags         calendar-integration
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Router       /units/{unitId}/calendar-integration [get]
func (h *CalendarIntegrationHandler) Get(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	pub, err := h.svc.GetPublic(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, pub)
}

// Put godoc
// @Summary      Create or update calendar integration for a unit
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Param        body body services.UpsertIntegrationRequest true "Settings"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Router       /units/{unitId}/calendar-integration [put]
func (h *CalendarIntegrationHandler) Put(w http.ResponseWriter, r *http.Request) {
	var req services.UpsertIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	unitID := chi.URLParam(r, "unitId")
	pub, err := h.svc.UpsertIntegration(unitID, &req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RespondJSON(w, pub)
}
