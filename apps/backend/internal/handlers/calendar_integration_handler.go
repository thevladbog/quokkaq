package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
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

const (
	calendarIntMsgInternal     = "Internal server error"
	calendarIntMsgInvalidJSON  = "Invalid request body"
	calendarIntMsgBadRequest   = "Bad request"
	calendarIntMsgForbidden    = "Forbidden"
	calendarIntMsgNotFound     = "Not found"
	calendarIntMsgCannotDelete = "Cannot delete integration"
)

func logCalendarIntegration(op string, err error) {
	log.Printf("calendar integration handler %s: %v", op, err)
}

func writeJSONDecodeError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op+": json decode", err)
	http.Error(w, calendarIntMsgInvalidJSON, http.StatusBadRequest)
}

// respondCalendarIntegrationError maps service/repository errors to safe HTTP responses and logs details.
func respondCalendarIntegrationError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op, err)
	switch {
	case errors.Is(err, services.ErrCalendarIntegrationLimit):
		http.Error(w, services.ErrCalendarIntegrationLimit.Error(), http.StatusConflict)
	case errors.Is(err, services.ErrCalendarIntegrationKindUnknown):
		http.Error(w, services.ErrCalendarIntegrationKindUnknown.Error(), http.StatusBadRequest)
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, calendarIntMsgNotFound, http.StatusNotFound)
	case isCalendarUnitCompanyMismatch(err):
		http.Error(w, calendarIntMsgForbidden, http.StatusForbidden)
	case isCalendarAppPasswordRequired(err):
		http.Error(w, calendarIntMsgBadRequest, http.StatusBadRequest)
	default:
		http.Error(w, calendarIntMsgInternal, http.StatusInternalServerError)
	}
}

func respondCalendarIntegrationDeleteError(w http.ResponseWriter, op string, err error) {
	logCalendarIntegration(op, err)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, calendarIntMsgNotFound, http.StatusNotFound)
	case isCalendarUnitCompanyMismatch(err):
		http.Error(w, calendarIntMsgForbidden, http.StatusForbidden)
	case isCalendarCannotDeleteWithPreRegs(err):
		http.Error(w, calendarIntMsgCannotDelete, http.StatusBadRequest)
	default:
		http.Error(w, calendarIntMsgInternal, http.StatusInternalServerError)
	}
}

func isCalendarUnitCompanyMismatch(err error) bool {
	return err != nil && strings.Contains(err.Error(), "unit does not belong to company")
}

func isCalendarAppPasswordRequired(err error) bool {
	return err != nil && strings.Contains(err.Error(), "app password is required")
}

func isCalendarCannotDeleteWithPreRegs(err error) bool {
	return err != nil && strings.Contains(err.Error(), "cannot delete calendar integration")
}

// Get godoc
// @ID           calendarIntegrationGet
// @Summary      Get calendar integration settings for a unit (legacy: first integration)
// @Tags         calendar-integration
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Success      200 {object} services.CalendarIntegrationPublic
// @Router       /units/{unitId}/calendar-integration [get]
func (h *CalendarIntegrationHandler) Get(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	unitID := chi.URLParam(r, "unitId")
	pub, err := h.svc.GetPublic(unitID, companyID)
	if err != nil {
		respondCalendarIntegrationError(w, "Get", err)
		return
	}
	RespondJSON(w, pub)
}

// Put godoc
// @ID           calendarIntegrationPut
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
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req services.UpsertIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONDecodeError(w, "Put", err)
		return
	}
	unitID := chi.URLParam(r, "unitId")
	pub, err := h.svc.UpsertIntegration(unitID, companyID, &req)
	if err != nil {
		respondCalendarIntegrationError(w, "Put", err)
		return
	}
	RespondJSON(w, pub)
}

// ListMine godoc
// @ID           calendarIntegrationListMine
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
		respondCalendarIntegrationError(w, "ListMine", err)
		return
	}
	if list == nil {
		list = []services.CalendarIntegrationPublic{}
	}
	RespondJSON(w, list)
}

// CreateMine godoc
// @ID           calendarIntegrationCreateMine
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
		writeJSONDecodeError(w, "CreateMine", err)
		return
	}
	pub, err := h.svc.CreateIntegration(companyID, &req)
	if err != nil {
		respondCalendarIntegrationError(w, "CreateMine", err)
		return
	}
	RespondJSON(w, pub)
}

// PutMine godoc
// @ID           calendarIntegrationPutMine
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
		writeJSONDecodeError(w, "PutMine", err)
		return
	}
	pub, err := h.svc.UpdateIntegration(companyID, integrationID, &req)
	if err != nil {
		respondCalendarIntegrationError(w, "PutMine", err)
		return
	}
	RespondJSON(w, pub)
}

// DeleteMine godoc
// @ID           calendarIntegrationDeleteMine
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
		respondCalendarIntegrationDeleteError(w, "DeleteMine", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
