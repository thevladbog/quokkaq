package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

var errPreRegVisitorNameRequired = errors.New("customer first name or last name is required")

// preRegistrationVisitorValidation trims visitor names and normalizes phone for create/update flows.
func preRegistrationVisitorValidation(customerFirstName, customerLastName, customerPhone string) (fn, ln, normalizedPhone string, err error) {
	fn = strings.TrimSpace(customerFirstName)
	ln = strings.TrimSpace(customerLastName)
	if fn == "" && ln == "" {
		return "", "", "", errPreRegVisitorNameRequired
	}
	normalizedPhone, err = phoneutil.ParseAndNormalize(customerPhone, phoneutil.DefaultRegion())
	if err != nil {
		return "", "", "", err
	}
	return fn, ln, normalizedPhone, nil
}

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
	fn, ln, normalizedPhone, vErr := preRegistrationVisitorValidation(req.CustomerFirstName, req.CustomerLastName, req.CustomerPhone)
	if vErr != nil {
		http.Error(w, vErr.Error(), http.StatusBadRequest)
		return
	}

	preReg := models.PreRegistration{
		UnitID:            unitID,
		ServiceID:         req.ServiceID,
		Date:              req.Date,
		Time:              req.Time,
		CustomerFirstName: fn,
		CustomerLastName:  ln,
		CustomerPhone:     normalizedPhone,
		Comment:           req.Comment,
	}

	if err := h.service.Create(r.Context(), &preReg, req.ExternalEventHref, req.ExternalEventEtag); err != nil {
		if errors.Is(err, services.ErrCalendarSlotTaken) || errors.Is(err, services.ErrCalendarSlotNotFree) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
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
	unitID := chi.URLParam(r, "unitId")

	// Get existing pre-registration
	existing, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, "Pre-registration not found", http.StatusNotFound)
		return
	}
	if existing.UnitID != unitID {
		http.Error(w, "Pre-registration not found", http.StatusNotFound)
		return
	}

	if st := strings.TrimSpace(updateData.Status); st != "" && st != "canceled" {
		http.Error(w, `only "canceled" is allowed for status`, http.StatusBadRequest)
		return
	}

	fn, ln, normalizedPhone, vErr := preRegistrationVisitorValidation(updateData.CustomerFirstName, updateData.CustomerLastName, updateData.CustomerPhone)
	if vErr != nil {
		http.Error(w, vErr.Error(), http.StatusBadRequest)
		return
	}

	previous := models.ClonePreRegistration(existing)

	// Update only editable fields
	existing.ServiceID = updateData.ServiceID
	existing.Date = updateData.Date
	existing.Time = updateData.Time
	existing.CustomerFirstName = fn
	existing.CustomerLastName = ln
	existing.CustomerPhone = normalizedPhone
	existing.Comment = updateData.Comment
	if strings.TrimSpace(updateData.Status) == "canceled" {
		existing.Status = "canceled"
	}

	if err := h.service.Update(r.Context(), previous, existing, &updateData); err != nil {
		switch {
		case errors.Is(err, services.ErrPreRegistrationCannotCancel),
			errors.Is(err, services.ErrPreRegistrationCanceledImmutable):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	RespondJSON(w, existing)
}

// GetCalendarSlots godoc
// @Summary      List calendar-backed slots with CalDAV hrefs (when integration enabled)
// @Tags         pre-registrations
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        serviceId query string true "Service ID"
// @Param        date query string true "Date YYYY-MM-DD"
// @Success      200 {array} models.PreRegCalendarSlotItem
// @Router       /units/{unitId}/pre-registrations/calendar-slots [get]
func (h *PreRegistrationHandler) GetCalendarSlots(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	serviceID := r.URL.Query().Get("serviceId")
	date := r.URL.Query().Get("date")
	if serviceID == "" || date == "" {
		http.Error(w, "serviceId and date are required", http.StatusBadRequest)
		return
	}
	items, err := h.service.ListCalendarSlotItems(unitID, serviceID, date)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []models.PreRegCalendarSlotItem{}
	}
	RespondJSON(w, items)
}

// GetAvailableSlots godoc
// @Summary      Get available time slots for pre-registration
// @Description  Returns HH:MM slot strings; uses CalDAV when integration is enabled.
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
	ticket, err := h.ticketService.CreateTicketWithPreRegistration(preReg.UnitID, preReg.ServiceID, preReg.ID, nil)
	if err != nil {
		if errors.Is(err, phoneutil.ErrInvalidPhone) ||
			errors.Is(err, services.ErrPreRegistrationPhoneInvalid) ||
			errors.Is(err, services.ErrDuplicateClientPhone) ||
			errors.Is(err, services.ErrCustomerNameEmpty) {
			RespondJSON(w, models.PreRegistrationRedeemResponse{
				Success: false,
				Message: err.Error(),
			})
			return
		}
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
