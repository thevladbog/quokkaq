package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type CalendarIntegrationHandler struct {
	svc      *services.CalendarIntegrationService
	userRepo repository.UserRepository
}

func NewCalendarIntegrationHandler(svc *services.CalendarIntegrationService, userRepo repository.UserRepository) *CalendarIntegrationHandler {
	return &CalendarIntegrationHandler{svc: svc, userRepo: userRepo}
}

func (h *CalendarIntegrationHandler) resolveCompanyID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return "", false
		}
		log.Printf("calendar integration company: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", false
	}
	return companyID, true
}

// Get godoc
// @Summary      Get calendar integration settings for a unit (legacy: first integration)
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
// @Summary      Create or update calendar integration for a unit (legacy)
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

// ListMine godoc
// @Summary      List calendar integrations for current company
// @Tags         calendar-integration
// @Produce      json
// @Security     BearerAuth
// @Success      200 {array} services.CalendarIntegrationPublic
// @Router       /companies/me/calendar-integrations [get]
func (h *CalendarIntegrationHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	list, err := h.svc.ListPublicForCompany(companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []services.CalendarIntegrationPublic{}
	}
	RespondJSON(w, list)
}

// CreateMine godoc
// @Summary      Create a calendar integration for a unit in the company
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body services.CreateCalendarIntegrationRequest true "Payload"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Router       /companies/me/calendar-integrations [post]
func (h *CalendarIntegrationHandler) CreateMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req services.CreateCalendarIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pub, err := h.svc.CreateIntegration(companyID, &req)
	if err != nil {
		if errors.Is(err, services.ErrCalendarIntegrationLimit) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RespondJSON(w, pub)
}

// PutMine godoc
// @Summary      Update a calendar integration
// @Tags         calendar-integration
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        integrationId path string true "Integration ID"
// @Param        body body services.UpdateCalendarIntegrationRequest true "Payload"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Router       /companies/me/calendar-integrations/{integrationId} [put]
func (h *CalendarIntegrationHandler) PutMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	integrationID := chi.URLParam(r, "integrationId")
	var req services.UpdateCalendarIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	pub, err := h.svc.UpdateIntegration(companyID, integrationID, &req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RespondJSON(w, pub)
}

// DeleteMine godoc
// @Summary      Delete a calendar integration
// @Tags         calendar-integration
// @Security     BearerAuth
// @Param        integrationId path string true "Integration ID"
// @Success      204
// @Router       /companies/me/calendar-integrations/{integrationId} [delete]
func (h *CalendarIntegrationHandler) DeleteMine(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	integrationID := chi.URLParam(r, "integrationId")
	if err := h.svc.DeleteIntegration(companyID, integrationID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
