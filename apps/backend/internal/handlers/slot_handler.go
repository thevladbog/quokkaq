package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type SlotHandler struct {
	service  *services.SlotService
	calendar *services.CalendarIntegrationService
}

func NewSlotHandler(service *services.SlotService, calendar *services.CalendarIntegrationService) *SlotHandler {
	return &SlotHandler{service: service, calendar: calendar}
}

func (h *SlotHandler) rejectIfCalendarReadOnly(w http.ResponseWriter, unitID string) bool {
	if h.calendar == nil {
		return false
	}
	ro, err := h.calendar.HasEnabledCalendarIntegration(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return true
	}
	if ro {
		http.Error(w, "slot capacity is managed by calendar integration", http.StatusConflict)
		return true
	}
	return false
}

// GetConfig godoc
// @Summary      Get slot configuration for a unit
// @Description  Returns weekly slot window settings (start/end time, interval, active days). If none exist, returns defaults scoped to the unit.
// @Tags         slots
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {object}  models.SlotConfig
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/config [get]
func (h *SlotHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	config, err := h.service.GetConfig(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, config)
}

// UpdateConfig godoc
// @Summary      Update slot configuration for a unit
// @Description  Creates or updates weekly slot window settings for the unit.
// @Tags         slots
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string             true  "Unit ID"
// @Param        config body      models.SlotConfig  true  "Slot configuration"
// @Success      200    {object}  models.SlotConfig
// @Failure      400    {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      409    {string}  string "Conflict"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/config [put]
func (h *SlotHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var config models.SlotConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	if h.rejectIfCalendarReadOnly(w, unitID) {
		return
	}
	config.UnitID = unitID

	if err := h.service.UpdateConfig(&config); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, config)
}

// GetCapacities godoc
// @Summary      Get weekly slot capacities for a unit
// @Description  Returns per-day, per-service capacity definitions used when generating slots.
// @Tags         slots
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.WeeklySlotCapacity
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/capacities [get]
func (h *SlotHandler) GetCapacities(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	capacities, err := h.service.GetWeeklyCapacities(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, capacities)
}

// UpdateCapacities godoc
// @Summary      Replace weekly slot capacities for a unit
// @Description  Updates all weekly capacity rows for the unit; unitId on each item is set from the path.
// @Tags         slots
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId      path      string                        true  "Unit ID"
// @Param        capacities  body      []models.WeeklySlotCapacity   true  "Weekly capacities"
// @Success      200         {array}   models.WeeklySlotCapacity
// @Failure      400         {string}  string "Bad Request"
// @Failure      401         {string}  string "Unauthorized"
// @Failure      403         {string}  string "Forbidden"
// @Failure      409         {string}  string "Conflict"
// @Failure      500         {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/capacities [put]
func (h *SlotHandler) UpdateCapacities(w http.ResponseWriter, r *http.Request) {
	var capacities []models.WeeklySlotCapacity
	if err := json.NewDecoder(r.Body).Decode(&capacities); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	if h.rejectIfCalendarReadOnly(w, unitID) {
		return
	}
	// Ensure all capacities have the correct UnitID
	for i := range capacities {
		capacities[i].UnitID = unitID
	}

	if err := h.service.UpdateWeeklyCapacities(unitID, capacities); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, capacities)
}

// Generate godoc
// @Summary      Generate service slots for a date range
// @Description  Materializes slots for the unit between the given dates based on config and capacities.
// @Tags         slots
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string                      true  "Unit ID"
// @Param        body   body      models.GenerateSlotsRequest true  "Inclusive from/to dates (YYYY-MM-DD)"
// @Success      200    {object}  models.SlotSuccessResponse
// @Failure      400    {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      409    {string}  string "Conflict"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/generate [post]
func (h *SlotHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req models.GenerateSlotsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	if h.rejectIfCalendarReadOnly(w, unitID) {
		return
	}
	if err := h.service.GenerateSlots(unitID, req.From, req.To); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, models.SlotSuccessResponse{Success: true})
}

// GetDay godoc
// @Summary      Get generated slots for a calendar day
// @Description  Returns the day schedule with per-slot booking counts. Responds 404 if slots have not been generated for that date.
// @Tags         slots
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Param        date   path      string  true  "Date (YYYY-MM-DD)"
// @Success      200    {object}  models.DayScheduleWithBookings
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not Found"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/day/{date} [get]
func (h *SlotHandler) GetDay(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	date := chi.URLParam(r, "date")

	slots, err := h.service.GetDaySlotsWithBookings(unitID, date)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// If nil, return 404 or empty? Frontend expects something to know if generated.
	// If nil, it means not generated.
	if slots == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	RespondJSON(w, slots)
}

// UpdateDay godoc
// @Summary      Update a single day schedule
// @Description  Sets day-off flag and replaces service slots for the given date after validation.
// @Tags         slots
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string                            true  "Unit ID"
// @Param        date   path      string                            true  "Date (YYYY-MM-DD)"
// @Param        body   body      models.UpdateDayScheduleRequest   true  "Day schedule update"
// @Success      200    {object}  models.SlotSuccessResponse
// @Failure      400    {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      409    {string}  string "Conflict"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/slots/day/{date} [put]
func (h *SlotHandler) UpdateDay(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateDayScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	date := chi.URLParam(r, "date")

	if h.rejectIfCalendarReadOnly(w, unitID) {
		return
	}

	if err := h.service.UpdateDaySlots(unitID, date, req); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, models.SlotSuccessResponse{Success: true})
}
