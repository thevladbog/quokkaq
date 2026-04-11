package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type ShiftHandler struct {
	service services.ShiftService
}

func NewShiftHandler(service services.ShiftService) *ShiftHandler {
	return &ShiftHandler{service: service}
}

// GetDashboardStats godoc
// @Summary      Get dashboard stats
// @Description  Retrieves dashboard statistics for a unit
// @Tags         shift
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {object}  map[string]interface{}
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/shift/dashboard [get]
func (h *ShiftHandler) GetDashboardStats(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	stats, err := h.service.GetDashboardStats(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, stats)
}

// GetQueueTickets godoc
// @Summary      Get queue tickets
// @Description  Retrieves current queue tickets for a unit
// @Tags         shift
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.Ticket
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/shift/queue [get]
func (h *ShiftHandler) GetQueueTickets(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	tickets, err := h.service.GetQueueTickets(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, tickets)
}

// GetShiftCounters godoc
// @Summary      List counters for shift dashboard
// @Description  Returns stations (counters) for the unit with occupancy flag and optional active ticket for the supervisor shift view.
// @Tags         shift
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   services.ShiftCounterDTO
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/shift/counters [get]
func (h *ShiftHandler) GetShiftCounters(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	counters, err := h.service.GetShiftCounters(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, counters)
}

// GetShiftActivity godoc
// @Summary      Shift ticket activity feed
// @Description  Paginated ticket history rows for tickets belonging to the unit (supervisor dashboard / journal). Limit is capped at 100.
// @Tags         shift
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Param        limit  query     int     false "Page size (default 20, max 100)"
// @Param        cursor query     string  false "Opaque keyset pagination cursor"
// @Success      200    {object}  services.ShiftActivityResponse
// @Failure      400    {string}  string "Bad Request"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/shift/activity [get]
func (h *ShiftHandler) GetShiftActivity(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	cursor := r.URL.Query().Get("cursor")
	resp, err := h.service.GetShiftActivity(unitID, limit, cursor)
	if err != nil {
		if errors.Is(err, services.ErrInvalidShiftActivityCursor) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// ExecuteEndOfDay godoc
// @Summary      Execute End of Day
// @Description  Performs end of day operations for a unit
// @Tags         shift
// @Accept       json
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {object}  map[string]interface{}
// @Failure      401    {string}  string "Unauthorized"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/shift/eod [post]
func (h *ShiftHandler) ExecuteEndOfDay(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "End of day requires an authenticated user; user id missing from request context", http.StatusUnauthorized)
		return
	}
	actorID := uid
	result, err := h.service.ExecuteEndOfDay(r.Context(), unitID, &actorID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, result)
}
