package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

func parseWeekdaysQuery(s string) []int {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var out []int
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	return out
}

func parseJournalDateParam(raw string) *string {
	s := strings.TrimSpace(raw)
	if len(s) != 10 {
		return nil
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return nil
	}
	return &s
}

func parseShiftActivityFilters(r *http.Request) *repository.TicketHistoryListFilters {
	q := r.URL.Query()
	var f repository.TicketHistoryListFilters
	nonEmpty := false
	if v := strings.TrimSpace(q.Get("counterId")); v != "" {
		f.CounterID = &v
		nonEmpty = true
	}
	if v := strings.TrimSpace(q.Get("userId")); v != "" {
		f.ActorUserID = &v
		nonEmpty = true
	}
	if v := strings.TrimSpace(q.Get("clientId")); v != "" {
		f.ClientID = &v
		nonEmpty = true
	}
	if v := strings.TrimSpace(q.Get("ticket")); v != "" {
		f.Ticket = &v
		nonEmpty = true
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		f.Search = &v
		nonEmpty = true
	}
	if wd := parseWeekdaysQuery(q.Get("weekdays")); len(wd) > 0 {
		f.Weekdays = wd
		nonEmpty = true
	}
	if df := parseJournalDateParam(q.Get("dateFrom")); df != nil {
		f.DateFrom = df
		nonEmpty = true
	}
	if dt := parseJournalDateParam(q.Get("dateTo")); dt != nil {
		f.DateTo = dt
		nonEmpty = true
	}
	if !nonEmpty {
		return nil
	}
	return &f
}

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
// @Description  Paginated ticket history rows for tickets belonging to the unit (supervisor dashboard / journal). Limit is capped at 100. Optional filters: counterId (current ticket counter_id), userId (history actor), clientId, ticket (UUID or queue substring), q (search queue/id/visitor name), weekdays (comma-separated PostgreSQL DOW 0=Sun..6=Sat in unit timezone), dateFrom/dateTo (YYYY-MM-DD inclusive, history timestamp calendar date in unit timezone). counter_id reflects the ticket's current assignment, not necessarily the desk at event time.
// @Tags         shift
// @Produce      json
// @Security     BearerAuth
// @Param        unitId    path      string  true  "Unit ID"
// @Param        limit     query     int     false "Page size (default 20, max 100)"
// @Param        cursor    query     string  false "Opaque keyset pagination cursor"
// @Param        counterId query     string  false "Filter by ticket.counter_id"
// @Param        userId    query     string  false "Filter by history actor user id"
// @Param        clientId  query     string  false "Filter by ticket.client_id"
// @Param        ticket    query     string  false "Ticket UUID or queue number substring"
// @Param        q         query     string  false "Search queue number, ticket id, or visitor name"
// @Param        weekdays  query     string  false "Comma-separated DOW 0-6 (unit timezone)"
// @Param        dateFrom  query     string  false "Inclusive start date YYYY-MM-DD (unit timezone)"
// @Param        dateTo    query     string  false "Inclusive end date YYYY-MM-DD (unit timezone)"
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
	filters := parseShiftActivityFilters(r)
	resp, err := h.service.GetShiftActivity(unitID, limit, cursor, filters)
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

// ListShiftActivityActors godoc
// @Summary      Distinct operators in unit ticket history
// @Description  User ids and display names for journal filter dropdown (from ticket_histories in this unit).
// @Tags         shift
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Success      200    {object}  services.ShiftActivityActorsResponse
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/shift/activity/actors [get]
func (h *ShiftHandler) ListShiftActivityActors(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	items, err := h.service.ListShiftActivityActors(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, services.ShiftActivityActorsResponse{Items: items})
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
