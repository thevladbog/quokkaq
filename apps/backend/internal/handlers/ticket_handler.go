package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type TicketHandler struct {
	service services.TicketService
}

func NewTicketHandler(service services.TicketService) *TicketHandler {
	return &TicketHandler{service: service}
}

type CreateTicketRequest struct {
	UnitID    string `json:"unitId"`
	ServiceID string `json:"serviceId"`
}

// CreateTicket godoc
// @Summary      Create a new ticket
// @Description  Creates a new ticket for a service in a unit
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        request body CreateTicketRequest true "Ticket Request"
// @Success      201  {object}  models.Ticket
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/tickets [post]
func (h *TicketHandler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CreateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Use unitID from URL, ignore what's in body if any
	ticket, err := h.service.CreateTicket(unitID, req.ServiceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, ticket)
}

// GetTicketByID godoc
// @Summary      Get ticket by ID
// @Description  Retrieves a ticket by its ID
// @Tags         tickets
// @Produce      json
// @Param        id   path      string  true  "Ticket ID"
// @Success      200  {object}  models.Ticket
// @Failure      404  {string}  string "Ticket not found"
// @Router       /tickets/{id} [get]
func (h *TicketHandler) GetTicketByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ticket, err := h.service.GetTicketByID(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	RespondJSON(w, ticket)
}

// GetTicketsByUnit godoc
// @Summary      Get tickets by unit
// @Description  Retrieves all tickets for a specific unit
// @Tags         tickets
// @Produce      json
// @Param        unitId path      string  true  "Unit ID"
// @Success      200    {array}   models.Ticket
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/tickets [get]
func (h *TicketHandler) GetTicketsByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	tickets, err := h.service.GetTicketsByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, tickets)
}

type CallNextRequest struct {
	CounterID string  `json:"counterId"`
	ServiceID *string `json:"serviceId"`
}

// CallNext godoc
// @Summary      Call next ticket
// @Description  Calls the next waiting ticket for a unit
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        unitId  path      string           true  "Unit ID"
// @Param        request body      CallNextRequest  true  "Call Next Request"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      404     {string}  string "No waiting tickets"
// @Router       /units/{unitId}/call-next [post]
func (h *TicketHandler) CallNext(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CallNextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, err := h.service.CallNext(unitID, req.CounterID, req.ServiceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound) // Or 404 if no tickets
		return
	}

	RespondJSON(w, ticket)
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
}

// UpdateStatus godoc
// @Summary      Update ticket status
// @Description  Updates the status of a ticket
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id      path      string               true  "Ticket ID"
// @Param        request body      UpdateStatusRequest  true  "Update Status Request"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /tickets/{id}/status [patch]
func (h *TicketHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, err := h.service.UpdateStatus(id, req.Status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, ticket)
}

// Recall godoc
// @Summary      Recall ticket
// @Description  Recalls a ticket
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id   path      string  true  "Ticket ID"
// @Success      200  {object}  models.Ticket
// @Failure      404  {string}  string "Ticket not found"
// @Router       /tickets/{id}/recall [post]
func (h *TicketHandler) Recall(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ticket, err := h.service.Recall(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	RespondJSON(w, ticket)
}

type PickRequest struct {
	CounterID string `json:"counterId"`
}

// Pick godoc
// @Summary      Pick ticket
// @Description  Picks a specific ticket for a counter
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id       path      string       true  "Ticket ID"
// @Param        request  body      PickRequest  true  "Pick Request"
// @Success      200      {object}  models.Ticket
// @Failure      404      {string}  string "Ticket not found"
// @Router       /tickets/{id}/pick [post]
func (h *TicketHandler) Pick(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req PickRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, err := h.service.Pick(id, req.CounterID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	RespondJSON(w, ticket)
}

type TransferRequest struct {
	ToCounterID *string `json:"toCounterId,omitempty"`
	ToUserID    *string `json:"toUserId,omitempty"`
}

// Transfer godoc
// @Summary      Transfer ticket
// @Description  Transfers a ticket to another counter or user
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id       path      string           true  "Ticket ID"
// @Param        request  body      TransferRequest  true  "Transfer Request"
// @Success      200      {object}  models.Ticket
// @Failure      404      {string}  string "Ticket not found"
// @Router       /tickets/{id}/transfer [post]
func (h *TicketHandler) Transfer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req TransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ticket, err := h.service.Transfer(id, req.ToCounterID, req.ToUserID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, ticket)
}

// ReturnToQueue godoc
// @Summary      Return ticket to queue
// @Description  Returns a ticket to the waiting queue
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id   path      string  true  "Ticket ID"
// @Success      200  {object}  models.Ticket
// @Failure      404  {string}  string "Ticket not found"
// @Router       /tickets/{id}/return [post]
func (h *TicketHandler) ReturnToQueue(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ticket, err := h.service.ReturnToQueue(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, ticket)
}
