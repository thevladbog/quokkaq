package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type CounterHandler struct {
	service services.CounterService
}

func NewCounterHandler(service services.CounterService) *CounterHandler {
	return &CounterHandler{service: service}
}

// CreateCounter godoc
// @Summary      Create a new counter
// @Description  Creates a new counter for a unit
// @Tags         counters
// @Accept       json
// @Produce      json
// @Param        counter body models.Counter true "Counter Data"
// @Success      201  {object}  models.Counter
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /counters [post]
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
// @Summary      Get a counter by ID
// @Description  Retrieves a specific counter by its ID
// @Tags         counters
// @Produce      json
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
// @Failure      404  {string}  string "Counter not found"
// @Router       /counters/{id} [get]
func (h *CounterHandler) GetCounterByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	counter, err := h.service.GetCounterByID(id)
	if err != nil {
		http.Error(w, "Counter not found", http.StatusNotFound)
		return
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
// @Param        counter body      models.Counter  true  "Counter Data"
// @Success      200     {object}  models.Counter
// @Failure      400     {string}  string "Bad Request"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /counters/{id} [put]
func (h *CounterHandler) UpdateCounter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var counter models.Counter
	if err := json.NewDecoder(r.Body).Decode(&counter); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	counter.ID = id

	if err := h.service.UpdateCounter(&counter); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
// @Summary      Occupy counter
// @Description  Sets a counter as occupied by the current user
// @Tags         counters
// @Accept       json
// @Produce      json
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
// @Failure      404  {string}  string "Counter not found"
// @Router       /counters/{id}/occupy [post]
func (h *CounterHandler) Occupy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		http.Error(w, "User ID not found in context", http.StatusUnauthorized)
		return
	}

	counter, err := h.service.Occupy(id, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  models.Counter
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
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {string}  string "Counter not found"
// @Router       /counters/{id}/force-release [post]
func (h *CounterHandler) ForceRelease(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var actor *string
	if uid, ok := middleware.GetUserIDFromContext(r.Context()); ok && uid != "" {
		actor = &uid
	}
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

// CallNext godoc
// @Summary      Call next ticket
// @Description  Calls the next waiting ticket for the counter
// @Tags         counters
// @Accept       json
// @Produce      json
// @Param        id   path      string  true  "Counter ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {string}  string "Counter not found or no tickets"
// @Router       /counters/{id}/call-next [post]
func (h *CounterHandler) CallNext(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Parse optional body for specific service filtering (if needed later)
	// For now, just call next.

	var actor *string
	if uid, ok := middleware.GetUserIDFromContext(r.Context()); ok && uid != "" {
		actor = &uid
	}
	ticket, err := h.service.CallNext(id, nil, actor)
	if err != nil {
		// If error is "record not found" type, return 404 or 200 with message?
		// Frontend expects { ok: boolean, ticket?: Ticket, message?: string }
		// But standard REST would be 404 if no ticket.
		// Let's return 404 if no ticket found.
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"ok":     true,
		"ticket": ticket,
	}
	RespondJSON(w, response)
}
