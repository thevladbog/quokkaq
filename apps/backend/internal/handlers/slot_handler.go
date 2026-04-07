package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type SlotHandler struct {
	service *services.SlotService
}

func NewSlotHandler(service *services.SlotService) *SlotHandler {
	return &SlotHandler{service: service}
}

func (h *SlotHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	config, err := h.service.GetConfig(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(config)
}

func (h *SlotHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var config models.SlotConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	config.UnitID = unitID

	if err := h.service.UpdateConfig(&config); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(config)
}

func (h *SlotHandler) GetCapacities(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	capacities, err := h.service.GetWeeklyCapacities(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(capacities)
}

func (h *SlotHandler) UpdateCapacities(w http.ResponseWriter, r *http.Request) {
	var capacities []models.WeeklySlotCapacity
	if err := json.NewDecoder(r.Body).Decode(&capacities); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	// Ensure all capacities have the correct UnitID
	for i := range capacities {
		capacities[i].UnitID = unitID
	}

	if err := h.service.UpdateWeeklyCapacities(unitID, capacities); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(capacities)
}

func (h *SlotHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	if err := h.service.GenerateSlots(unitID, req.From, req.To); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

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

	json.NewEncoder(w).Encode(slots)
}

func (h *SlotHandler) UpdateDay(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateDayScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	date := chi.URLParam(r, "date")

	if err := h.service.UpdateDaySlots(unitID, date, req); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
