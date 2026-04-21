package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// UpdateCounterRequest is the JSON body for PUT /counters/{id} (sparse update).
// Only name and/or serviceZoneId are applied; assignedTo and onBreak are rejected by the handler.
type UpdateCounterRequest struct {
	Name          *string `json:"name,omitempty"`
	ServiceZoneID *string `json:"serviceZoneId,omitempty"`
}

type CounterHandler struct {
	service     services.CounterService
	counterRepo repository.CounterRepository
	operational *services.OperationalService
	userRepo    repository.UserRepository
	unitRepo    repository.UnitRepository
}

func NewCounterHandler(service services.CounterService, counterRepo repository.CounterRepository, operational *services.OperationalService, userRepo repository.UserRepository, unitRepo repository.UnitRepository) *CounterHandler {
	return &CounterHandler{service: service, counterRepo: counterRepo, operational: operational, userRepo: userRepo, unitRepo: unitRepo}
}

func writeCounterServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, services.ErrCounterOccupancyOrBreakViaUpdate),
		errors.Is(err, services.ErrCounterInvalidServiceZoneIDType),
		errors.Is(err, services.ErrInvalidServiceZone):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// CreateCounter godoc
// @ID           CreateUnitCounter
// @Summary      Create a new counter
// @Description  Creates a new counter for a unit
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId  path   string        true  "Unit ID"
// @Param        counter body   models.Counter true  "Counter Data"
// @Success      201  {object}  models.Counter
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      402  {object}  handlers.QuotaExceededError "Quota Exceeded"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/counters [post]
func (h *CounterHandler) CreateCounter(w http.ResponseWriter, r *http.Request) {
	var counter models.Counter
	if err := json.NewDecoder(r.Body).Decode(&counter); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Extract unitId from URL path parameter
	unitID := chi.URLParam(r, "unitId")
	counter.UnitID = unitID

	if err := h.service.CreateCounter(&counter); err != nil {
		switch {
		case errors.Is(err, services.ErrCounterQuotaExceeded):
			writeQuotaExceeded(w, "counters", err)
		case errors.Is(err, services.ErrInvalidServiceZone):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, counter)
}

// GetCountersByUnit godoc
// @Summary      Get counters by unit
// @Description  Retrieves all counters for a specific unit
// @Tags         counters
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.Counter
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/counters [get]
func (h *CounterHandler) GetCountersByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	counters, err := h.service.GetCountersByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, counters)
}

// GetCounterByID godoc
// @Summary      Get a counter by ID (authenticated)
// @Description  Requires a Bearer token. Platform admins may read any counter; other callers must resolve a tenant via X-Company-Id when applicable, and the counter's unit must belong to that company (otherwise 404).
// @Tags         counters
// @Produce      json
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        id   path      string  true  "Counter ID"
// @Security     BearerAuth
// @Success      200  {object}  models.Counter
// @Failure      400  {string}  string "Company context required"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Counter not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /counters/{id} [get]
func (h *CounterHandler) GetCounterByID(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	counter, err := h.service.GetCounterByID(id)
	if err != nil {
		writeCounterServiceError(w, err)
		return
	}
	pf, err := h.userRepo.IsPlatformAdmin(userID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !pf {
		companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
		if err != nil {
			if errors.Is(err, repository.ErrCompanyAccessDenied) {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			http.Error(w, "Company context required", http.StatusBadRequest)
			return
		}
		unit, err := h.unitRepo.FindByIDLight(counter.UnitID)
		if err != nil {
			writeCounterServiceError(w, err)
			return
		}
		if unit.CompanyID != companyID {
			http.Error(w, "Counter not found", http.StatusNotFound)
			return
		}
	}
	RespondJSON(w, counter)
}

// UpdateCounter godoc
// @Summary      Update a counter
// @Description  Updates an existing counter
// @Tags         counters
// @Accept       json
// @Produce      json
// @Param        id      path      string          true  "Counter ID"
// @Param        counter body      UpdateCounterRequest  true  "Sparse counter fields (name, serviceZoneId)"
// @Success      200     {object}  models.Counter
// @Failure      400     {string}  string "Bad Request"
// @Failure      404     {string}  string "Not Found"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /counters/{id} [put]
func (h *CounterHandler) UpdateCounter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for k := range raw {
		switch k {
		case "name", "serviceZoneId", "assignedTo", "onBreak":
		default:
			http.Error(w, "unknown field: "+k, http.StatusBadRequest)
			return
		}
	}
	if _, ok := raw["assignedTo"]; ok {
		http.Error(w, services.ErrCounterOccupancyOrBreakViaUpdate.Error(), http.StatusBadRequest)
		return
	}
	if _, ok := raw["onBreak"]; ok {
		http.Error(w, services.ErrCounterOccupancyOrBreakViaUpdate.Error(), http.StatusBadRequest)
		return
	}

	var req UpdateCounterRequest
	if v, ok := raw["name"]; ok {
		var nameStr string
		if err := json.Unmarshal(v, &nameStr); err != nil {
			http.Error(w, "name: invalid JSON", http.StatusBadRequest)
			return
		}
		req.Name = &nameStr
	}
	if v, ok := raw["serviceZoneId"]; ok {
		var z *string
		if err := json.Unmarshal(v, &z); err != nil {
			http.Error(w, "serviceZoneId: invalid JSON", http.StatusBadRequest)
			return
		}
		req.ServiceZoneID = z
	}
	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if _, ok := raw["serviceZoneId"]; ok {
		if req.ServiceZoneID == nil {
			updates["service_zone_id"] = nil
		} else {
			updates["service_zone_id"] = *req.ServiceZoneID
		}
	}
	if len(updates) == 0 {
		http.Error(w, "no fields to update", http.StatusBadRequest)
		return
	}

	if err := h.service.UpdateCounter(id, updates); err != nil {
		writeCounterServiceError(w, err)
		return
	}
	counter, err := h.service.GetCounterByID(id)
	if err != nil {
		writeCounterServiceError(w, err)
		return
	}
	RespondJSON(w, counter)
}

// DeleteCounter godoc
// @Summary      Delete a counter
// @Description  Deletes a counter by its ID
// @Tags         counters
// @Param        id   path      string  true  "Counter ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /counters/{id} [delete]
func (h *CounterHandler) DeleteCounter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteCounter(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Occupy godoc
// @ID           OccupyCounter
// @Summary      Occupy counter
// @Description  Sets a counter as occupied by the current user
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Counter not found"
// @Router       /counters/{id}/occupy [post]
func (h *CounterHandler) Occupy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		http.Error(w, "User ID not found in context", http.StatusUnauthorized)
		return
	}

	if h.operational != nil && h.counterRepo != nil {
		c, err := h.counterRepo.FindByID(id)
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				logger.PrintfCtx(r.Context(), "counter Occupy: operational pre-check FindByID(counterId=%q) err=%v", id, err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		}
		if err == nil && c != nil {
			blocked, opErr := h.operational.IsCounterLoginBlocked(c.UnitID)
			if opErr != nil {
				http.Error(w, opErr.Error(), http.StatusInternalServerError)
				return
			}
			if blocked {
				http.Error(w, "counter login is blocked for end-of-day operations", http.StatusForbidden)
				return
			}
		}
	}

	counter, err := h.service.Occupy(id, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RespondJSON(w, counter)
}

// StartBreak godoc
// @Summary      Start operator break
// @Description  Puts the counter in break state (no active ticket). Idempotent failure: 409 if already on break.
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Counter not found"
// @Failure      409  {string}  string "Conflict (not occupied by user, active ticket, or already on break)"
// @Router       /counters/{id}/break/start [post]
func (h *CounterHandler) StartBreak(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		http.Error(w, "User ID not found in context", http.StatusUnauthorized)
		return
	}

	counter, err := h.service.StartBreak(id, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Counter not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrCounterNotOccupiedByUser) ||
			errors.Is(err, services.ErrCounterAlreadyOnBreak) ||
			errors.Is(err, services.ErrCounterBreakActiveTicket) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, counter)
}

// EndBreak godoc
// @Summary      End operator break
// @Description  Ends break and resumes idle. Idempotent failure: 409 if not on break.
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Counter not found"
// @Failure      409  {string}  string "Conflict (not occupied by user or not on break)"
// @Router       /counters/{id}/break/end [post]
func (h *CounterHandler) EndBreak(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		http.Error(w, "User ID not found in context", http.StatusUnauthorized)
		return
	}

	counter, err := h.service.EndBreak(id, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Counter not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrCounterNotOccupiedByUser) || errors.Is(err, services.ErrCounterNotOnBreak) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, counter)
}

// Release godoc
// @Summary      Release counter
// @Description  Releases a counter
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Counter not found"
// @Router       /counters/{id}/release [post]
func (h *CounterHandler) Release(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	counter, err := h.service.Release(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, counter)
}

// ForceRelease godoc
// @Summary      Force release counter
// @Description  Force releases a counter (supervisor)
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Counter not found"
// @Router       /counters/{id}/force-release [post]
func (h *CounterHandler) ForceRelease(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := getActorFromRequest(r)
	counter, ticket, err := h.service.ForceRelease(id, actor)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"counter":         counter,
		"completedTicket": ticket,
	}
	RespondJSON(w, response)
}

// CounterCallNextRequest is the optional JSON body for POST /counters/{id}/call-next (counter id is taken from the path only).
type CounterCallNextRequest struct {
	ServiceID  *string  `json:"serviceId"`
	ServiceIDs []string `json:"serviceIds"`
}

// CallNext godoc
// @Summary      Call next ticket
// @Description  Calls the next waiting ticket for the counter. Optional JSON body with serviceIds or legacy serviceId limits the queue; omit or empty body means all services.
// @Tags         counters
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id       path      string                   true  "Counter ID"
// @Param        request  body      CounterCallNextRequest   false "Optional service filter (serviceIds / serviceId); omit for all services"
// @Success      200      {object}  map[string]interface{}
// @Failure      400      {string}  string "Bad Request"
// @Failure      401      {string}  string "Unauthorized"
// @Failure      404      {string}  string "Counter not found or no tickets"
// @Failure      409      {string}  string "Counter on break"
// @Failure      500      {string}  string "Internal Server Error"
// @Router       /counters/{id}/call-next [post]
func (h *CounterHandler) CallNext(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req CounterCallNextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	filter := normalizeCallNextServiceFilter(req.ServiceIDs, req.ServiceID)
	actor := getActorFromRequest(r)
	ticket, err := h.service.CallNext(id, filter, actor)
	if err != nil {
		if errors.Is(err, services.ErrCallNextInvalidServices) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrCounterOnBreak) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrNoWaitingTickets) || errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"ok":     true,
		"ticket": ticket,
	}
	RespondJSON(w, response)
}
