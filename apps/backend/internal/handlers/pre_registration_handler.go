package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type PreRegistrationHandler struct {
	service       *services.PreRegistrationService
	ticketService services.TicketService // Interface
}

func NewPreRegistrationHandler(service *services.PreRegistrationService, ticketService services.TicketService) *PreRegistrationHandler {
	return &PreRegistrationHandler{
		service:       service,
		ticketService: ticketService,
	}
}

func (h *PreRegistrationHandler) GetByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	preRegs, err := h.service.GetByUnitID(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(preRegs)
}

func (h *PreRegistrationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var preReg models.PreRegistration
	if err := json.NewDecoder(r.Body).Decode(&preReg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	preReg.UnitID = unitID

	if err := h.service.Create(&preReg); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(preReg)
}

func (h *PreRegistrationHandler) Update(w http.ResponseWriter, r *http.Request) {
	var updateData struct {
		ServiceID     string `json:"serviceId"`
		Date          string `json:"date"`
		Time          string `json:"time"`
		CustomerName  string `json:"customerName"`
		CustomerPhone string `json:"customerPhone"`
		Comment       string `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	id := chi.URLParam(r, "id")

	// Get existing pre-registration
	existing, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, "Pre-registration not found", http.StatusNotFound)
		return
	}

	// Update only editable fields
	existing.ServiceID = updateData.ServiceID
	existing.Date = updateData.Date
	existing.Time = updateData.Time
	existing.CustomerName = updateData.CustomerName
	existing.CustomerPhone = updateData.CustomerPhone
	existing.Comment = updateData.Comment

	if err := h.service.Update(existing); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(existing)
}

func (h *PreRegistrationHandler) GetAvailableSlots(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	serviceID := r.URL.Query().Get("serviceId")
	date := r.URL.Query().Get("date")

	if serviceID == "" || date == "" {
		http.Error(w, "serviceId and date are required", http.StatusBadRequest)
		return
	}

	slots, err := h.service.GetAvailableSlots(unitID, serviceID, date)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(slots)
}

func (h *PreRegistrationHandler) Validate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	preReg, err := h.service.ValidateForKiosk(req.Code)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound) // Or 400 depending on error
		return
	}
	json.NewEncoder(w).Encode(preReg)
}

func (h *PreRegistrationHandler) Redeem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	type RedeemResponse struct {
		Success bool           `json:"success"`
		Ticket  *models.Ticket `json:"ticket,omitempty"`
		Message string         `json:"message,omitempty"`
	}

	// 1. Validate again
	preReg, err := h.service.ValidateForKiosk(req.Code)
	if err != nil {
		// Return 200 OK with error message for validation failures
		json.NewEncoder(w).Encode(RedeemResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	// 2. Create Ticket
	ticket, err := h.ticketService.CreateTicketWithPreRegistration(preReg.UnitID, preReg.ServiceID, preReg.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Mark as Redeemed
	if err := h.service.MarkAsRedeemed(preReg.ID, ticket.ID); err != nil {
		// Log error but don't fail the request as ticket is created?
		// Or fail? If we fail, client might retry and create duplicate tickets.
		// Ideally we should have a transaction.
		// For now, let's log and return success with warning or just success.
		// But if we don't mark it, it can be reused.
		// Let's return error for now.
		http.Error(w, "Failed to update pre-registration status", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(RedeemResponse{
		Success: true,
		Ticket:  ticket,
	})
}
