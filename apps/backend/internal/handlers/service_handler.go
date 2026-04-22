package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type ServiceHandler struct {
	service  services.ServiceService
	userRepo repository.UserRepository
}

func NewServiceHandler(service services.ServiceService, userRepo repository.UserRepository) *ServiceHandler {
	return &ServiceHandler{service: service, userRepo: userRepo}
}

// CreateService godoc
// @ID           CreateService
// @Summary      Create a new service
// @Description  Creates a new service for a unit
// @Tags         services
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        service body models.Service true "Service Data"
// @Success      201  {object}  models.Service
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      402  {object}  handlers.QuotaExceededError "Quota Exceeded"
// @Failure      403  {string}  string "Forbidden"
// @Failure      409  {string}  string "Conflict (duplicate calendar slot key for unit)"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /services [post]
func (h *ServiceHandler) CreateService(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var service models.Service
	if err := json.NewDecoder(r.Body).Decode(&service); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if service.UnitID == "" {
		http.Error(w, "unitId is required", http.StatusBadRequest)
		return
	}
	allowed, err := h.userRepo.IsAdminOrHasUnitAccess(userID, service.UnitID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !allowed {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if err := h.service.CreateService(&service); err != nil {
		switch {
		case errors.Is(err, services.ErrServiceQuotaExceeded):
			writeQuotaExceeded(w, "services", err)
		case errors.Is(err, services.ErrDuplicateCalendarSlotKey):
			http.Error(w, err.Error(), http.StatusConflict)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, service)
}

// GetServicesByUnit godoc
// @Summary      Get services by unit
// @Description  Retrieves all services for a specific unit
// @Tags         services
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.Service
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/services [get]
func (h *ServiceHandler) GetServicesByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	services, err := h.service.GetServicesByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, services)
}

// GetServiceByID godoc
// @Summary      Get a service by ID
// @Description  Retrieves a specific service by its ID
// @Tags         services
// @Produce      json
// @Param        id   path      string  true  "Service ID"
// @Success      200  {object}  models.Service
// @Failure      404  {string}  string "Service not found"
// @Router       /services/{id} [get]
func (h *ServiceHandler) GetServiceByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	service, err := h.service.GetServiceByID(id)
	if err != nil {
		http.Error(w, "Service not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, service)
}

// UpdateService godoc
// @Summary      Update a service
// @Description  Updates an existing service
// @Tags         services
// @Accept       json
// @Produce      json
// @Param        id      path      string          true  "Service ID"
// @Param        service body      models.Service  true  "Sparse or full service JSON; only sent fields are applied (grid-only updates no longer clear name/prefix)."
// @Success      200     {object}  models.Service
// @Failure      400     {string}  string "Bad Request"
// @Failure      409     {string}  string "Conflict (e.g. unit change not allowed)"
// @Failure      404     {string}  string "Not found"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /services/{id} [put]
func (h *ServiceHandler) UpdateService(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	existing, err := h.service.GetServiceByID(id)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Service not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "UpdateService GetServiceByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	merged := *existing
	merged.Children = nil
	merged.Parent = nil
	if err := services.MergeServiceJSONPatch(&merged, raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	merged.ID = id

	if err := h.service.UpdateService(&merged); err != nil {
		if errors.Is(err, services.ErrServiceUnitImmutable) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrDuplicateCalendarSlotKey) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if repository.IsNotFound(err) {
			http.Error(w, "Service not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, merged)
}

// DeleteService godoc
// @Summary      Delete a service
// @Description  Deletes a service by its ID
// @Tags         services
// @Param        id   path      string  true  "Service ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /services/{id} [delete]
func (h *ServiceHandler) DeleteService(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteService(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
