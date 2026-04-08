package handlers

import (
	"encoding/json"
	"errors"
	"log"
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

// GetByUnit godoc
// @Summary      List pre-registrations for a unit
// @Description  Returns all pre-registrations associated with the unit (authenticated unit member).
// @Tags         pre-registrations
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.PreRegistration
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/pre-registrations [get]
func (h *PreRegistrationHandler) GetByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	preRegs, err := h.service.GetByUnitID(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, preRegs)
}

// Create godoc
// @Summary      Create a pre-registration
// @Description  Creates a new pre-registration for the unit; unitId is taken from the path.
// @Tags         pre-registrations
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string                           true  "Unit ID"
// @Param        body   body      models.PreRegistrationCreateRequest   true  "Pre-registration payload"
// @Success      200    {object}  models.PreRegistration
// @Failure      400    {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/pre-registrations [post]
func (h *PreRegistrationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.PreRegistrationCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	unitID := chi.URLParam(r, "unitId")
	preReg := models.PreRegistration{
		UnitID:        unitID,
		ServiceID:     req.ServiceID,
		Date:          req.Date,
		Time:          req.Time,
		CustomerName:  req.CustomerName,
		CustomerPhone: req.CustomerPhone,
		Comment:       req.Comment,
	}

	if err := h.service.Create(&preReg); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, preReg)
}

// Update godoc
// @Summary      Update a pre-registration
// @Description  Updates editable fields on an existing pre-registration for the unit.
// @Tags         pre-registrations
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string                                true  "Unit ID"
// @Param        id     path      string                                true  "Pre-registration ID"
// @Param        body   body      models.PreRegistrationUpdateRequest   true  "Fields to update"
// @Success      200    {object}  models.PreRegistration
// @Failure      400    {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not Found"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/pre-registrations/{id} [put]
func (h *PreRegistrationHandler) Update(w http.ResponseWriter, r *http.Request) {
	var updateData models.PreRegistrationUpdateRequest
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
	RespondJSON(w, existing)
}

// GetAvailableSlots godoc
// @Summary      Get available time slots for pre-registration
// @Description  Returns HH:MM slot strings for a service on a given date, accounting for capacity and existing bookings.
// @Tags         pre-registrations
// @Produce      json
// @Param        unitId    path      string  true  "Unit ID"
// @Param        serviceId query     string  true  "Service ID"
// @Param        date      query     string  true  "Date (YYYY-MM-DD)"
// @Success      200       {array}   string
// @Failure      400       {string}  string "Bad Request"
// @Failure      500       {string}  string "Internal Server Error"
// @Router       /units/{unitId}/pre-registrations/slots [get]
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
	RespondJSON(w, slots)
}

// Validate godoc
// @Summary      Validate a pre-registration code (kiosk)
// @Description  Looks up a pre-registration by code for the unit context; returns the record when valid.
// @Tags         pre-registrations
// @Accept       json
// @Produce      json
// @Param        unitId path      string                             true  "Unit ID"
// @Param        body   body      models.PreRegistrationCodeRequest  true  "Six-digit code"
// @Success      200    {object}  models.PreRegistration
// @Failure      400    {string}  string "Bad Request"
// @Failure      404    {string}  string "Not Found"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/pre-registrations/validate [post]
func (h *PreRegistrationHandler) Validate(w http.ResponseWriter, r *http.Request) {
	var req models.PreRegistrationCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	preReg, err := h.service.ValidateForKiosk(req.Code)
	if err != nil {
		if errors.Is(err, services.ErrPreRegistrationNotFound) ||
			errors.Is(err, services.ErrPreRegistrationConsumed) ||
			errors.Is(err, services.ErrPreRegistrationTooEarly) ||
			errors.Is(err, services.ErrPreRegistrationTooLate) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		log.Printf("ValidateForKiosk: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, preReg)
}

// Redeem godoc
// @Summary      Redeem a pre-registration code (kiosk)
// @Description  Validates the code, creates a ticket, and marks the pre-registration redeemed. Invalid codes return HTTP 200 with success=false and a message; server errors use 5xx.
// @Tags         pre-registrations
// @Accept       json
// @Produce      json
// @Param        unitId path      string                             true  "Unit ID"
// @Param        body   body      models.PreRegistrationCodeRequest  true  "Six-digit code"
// @Success      200    {object}  models.PreRegistrationRedeemResponse
// @Failure      400    {string}  string "Bad Request"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/pre-registrations/redeem [post]
func (h *PreRegistrationHandler) Redeem(w http.ResponseWriter, r *http.Request) {
	var req models.PreRegistrationCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 1. Validate again
	preReg, err := h.service.ValidateForKiosk(req.Code)
	if err != nil {
		if errors.Is(err, services.ErrPreRegistrationNotFound) ||
			errors.Is(err, services.ErrPreRegistrationConsumed) ||
			errors.Is(err, services.ErrPreRegistrationTooEarly) ||
			errors.Is(err, services.ErrPreRegistrationTooLate) {
			RespondJSON(w, models.PreRegistrationRedeemResponse{
				Success: false,
				Message: err.Error(),
			})
			return
		}
		log.Printf("Redeem ValidateForKiosk: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// 2. Create Ticket
	ticket, err := h.ticketService.CreateTicketWithPreRegistration(preReg.UnitID, preReg.ServiceID, preReg.ID)
	if err != nil {
		log.Printf("Redeem CreateTicketWithPreRegistration: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// 3. Mark as Redeemed
	if err := h.service.MarkAsRedeemed(preReg.ID, ticket.ID); err != nil {
		log.Printf("Redeem MarkAsRedeemed: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, models.PreRegistrationRedeemResponse{
		Success: true,
		Ticket:  ticket,
	})
}
