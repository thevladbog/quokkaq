package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type TicketHandler struct {
	service services.TicketService
}

func NewTicketHandler(service services.TicketService) *TicketHandler {
	return &TicketHandler{service: service}
}

// CreateTicketRequest is the JSON body for POST /units/{unitId}/tickets (unit comes from the path).
type CreateTicketRequest struct {
	ServiceID string  `json:"serviceId" binding:"required"`
	ClientID  *string `json:"clientId,omitempty"`
}

// CreateTicket godoc
// @Summary      Create a new ticket
// @Description  Creates a new ticket for a service in a unit. Unit is taken from the path; body requires serviceId (optional clientId).
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
	if strings.TrimSpace(req.ServiceID) == "" {
		http.Error(w, "serviceId is required", http.StatusBadRequest)
		return
	}

	// Use unitID from URL, ignore what's in body if any
	var staffClientID *string
	if req.ClientID != nil && strings.TrimSpace(*req.ClientID) != "" {
		s := strings.TrimSpace(*req.ClientID)
		staffClientID = &s
	}
	ticket, err := h.service.CreateTicket(unitID, req.ServiceID, staffClientID, nil)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrVisitorAnonymousNotAllowed),
			errors.Is(err, services.ErrTicketCreateClientNotInUnit),
			errors.Is(err, services.ErrDuplicateClientPhone):
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
	CounterID  string   `json:"counterId" binding:"required"`
	ServiceID  *string  `json:"serviceId"`
	ServiceIDs []string `json:"serviceIds"`
}

// CallNext godoc
// @Summary      Call next ticket
// @Description  Calls the next waiting ticket for a unit. JSON body must include counterId. Optional serviceIds (or legacy serviceId) limit the queue; omit or empty means all services in the unit.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        unitId  path      string           true  "Unit ID"
// @Param        request body      CallNextRequest  false "Optional counterId plus serviceIds (or legacy serviceId); omit or empty body for defaults"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      404     {string}  string "No waiting tickets"
// @Failure      409     {string}  string "Counter on break"
// @Router       /units/{unitId}/call-next [post]
func (h *TicketHandler) CallNext(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CallNextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.CounterID) == "" {
		http.Error(w, "counterId is required", http.StatusBadRequest)
		return
	}

	actor := getActorFromRequest(r)
	filter := normalizeCallNextServiceFilter(req.ServiceIDs, req.ServiceID)
	ticket, err := h.service.CallNext(unitID, strings.TrimSpace(req.CounterID), filter, actor)
	if err != nil {
		if errors.Is(err, services.ErrCallNextInvalidServices) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrCounterOnBreak) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrNoWaitingTickets) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	actor := getActorFromRequest(r)
	ticket, err := h.service.UpdateStatus(id, req.Status, actor)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, ticket)
}

// OperatorCommentPatchDTO documents the JSON body for PATCH /tickets/{id}/operator-comment (Swagger only).
// operatorComment must be present: use a string to set the comment, or JSON null to clear it.
type OperatorCommentPatchDTO struct {
	OperatorComment *string `json:"operatorComment" binding:"required" example:"VIP, повторный визит" extensions:"x-nullable"`
}

// UpdateOperatorComment godoc
// @Summary      Update operator comment on ticket
// @Description  Body must include operatorComment. Send a string to set the comment, or JSON null to clear it.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id      path      string                   true  "Ticket ID"
// @Param        request body      OperatorCommentPatchDTO  true  "operatorComment: string to set, or JSON null to clear"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      401     {string}  string "Unauthorized"
// @Failure      403     {string}  string "Forbidden"
// @Failure      404     {string}  string "Ticket not found"
// @Router       /tickets/{id}/operator-comment [patch]
func (h *TicketHandler) UpdateOperatorComment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var rawBody map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&rawBody); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	rawMsg, ok := rawBody["operatorComment"]
	if !ok {
		http.Error(w, "operatorComment is required", http.StatusBadRequest)
		return
	}

	raw := bytes.TrimSpace(rawMsg)
	var commentArg *string
	if bytes.Equal(raw, []byte("null")) {
		commentArg = nil
	} else {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			http.Error(w, "operatorComment must be a string or null", http.StatusBadRequest)
			return
		}
		commentArg = &s
	}

	actor := getActorFromRequest(r)
	ticket, err := h.service.UpdateOperatorComment(id, commentArg, actor)
	if err != nil {
		if errors.Is(err, services.ErrOperatorCommentTooLong) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
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
	actor := getActorFromRequest(r)
	ticket, err := h.service.Recall(id, actor)
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
// @Failure      400      {string}  string "Bad Request (e.g. counter not in ticket unit)"
// @Failure      404      {string}  string "Ticket not found"
// @Failure      409      {string}  string "Counter on break"
// @Router       /tickets/{id}/pick [post]
func (h *TicketHandler) Pick(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req PickRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	actor := getActorFromRequest(r)
	ticket, err := h.service.Pick(id, req.CounterID, actor)
	if err != nil {
		if errors.Is(err, services.ErrCounterUnitMismatch) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrCounterOnBreak) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
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

	actor := getActorFromRequest(r)
	ticket, err := h.service.Transfer(id, req.ToCounterID, req.ToUserID, actor)
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
	actor := getActorFromRequest(r)
	ticket, err := h.service.ReturnToQueue(id, actor)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, ticket)
}

// PatchTicketVisitorRequest is the JSON body for PATCH /tickets/{id}/visitor.
// At least one of clientId, firstName, lastName, or phone must be sent; {} is invalid (OpenAPI 2 cannot express the XOR of clientId vs phone+names).
type PatchTicketVisitorRequest struct {
	ClientID  *string `json:"clientId"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Phone     *string `json:"phone"`
}

// UpdateTicketVisitor godoc
// @Summary      Attach or change visitor on active ticket
// @Description  Allowed when status is called or in_service. Body must not be empty. Either: (A) clientId — optional firstName/lastName to rename that client; do not send phone, or (B) firstName, lastName, and phone without clientId to find/create by phone.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id      path      string                    true  "Ticket ID"
// @Param        request body      PatchTicketVisitorRequest true  "Visitor payload"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      401     {string}  string "Unauthorized"
// @Failure      403     {string}  string "Forbidden"
// @Failure      404     {string}  string "Not Found"
// @Failure      409     {string}  string "Conflict"
// @Router       /tickets/{id}/visitor [patch]
func (h *TicketHandler) UpdateTicketVisitor(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req PatchTicketVisitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ClientID == nil && req.FirstName == nil && req.LastName == nil && req.Phone == nil {
		http.Error(w, "visitor payload is required", http.StatusBadRequest)
		return
	}

	actor := getActorFromRequest(r)
	ticket, err := h.service.UpdateTicketVisitor(id, services.PatchTicketVisitorInput{
		ClientID:  req.ClientID,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Phone:     req.Phone,
	}, actor)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrTicketVisitorWrongStatus),
			errors.Is(err, services.ErrVisitorAnonymousNotAllowed),
			errors.Is(err, services.ErrDuplicateClientPhone):
			http.Error(w, err.Error(), http.StatusConflict)
		case errors.Is(err, gorm.ErrRecordNotFound),
			errors.Is(err, repository.ErrNoNamedUnitClientUpdated):
			http.Error(w, err.Error(), http.StatusNotFound)
		default:
			if errors.Is(err, phoneutil.ErrInvalidPhone) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if errors.Is(err, services.ErrVisitorMutuallyExclusive) ||
				errors.Is(err, services.ErrVisitorPayloadInvalid) ||
				errors.Is(err, services.ErrVisitorNameRequired) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	RespondJSON(w, ticket)
}

type putVisitorTagsRequest struct {
	TagDefinitionIDs []string `json:"tagDefinitionIds" binding:"required"`
	OperatorComment  string   `json:"operatorComment" binding:"required"`
}

// SetVisitorTags godoc
// @Summary      Replace visitor tags for ticket's client
// @Description  Full replacement of tag assignments on the ticket's visitor. Allowed when status is called or in_service; not for anonymous kiosk client. operatorComment is required and appended to the ticket operator comment.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Ticket ID"
// @Param        body body putVisitorTagsRequest true "tagDefinitionIds (full set) and operatorComment"
// @Success      200 {object} models.Ticket
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not Found"
// @Failure      409 {string} string "Conflict"
// @Router       /tickets/{id}/visitor-tags [put]
func (h *TicketHandler) SetVisitorTags(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if _, ok := raw["tagDefinitionIds"]; !ok {
		http.Error(w, "tagDefinitionIds is required", http.StatusBadRequest)
		return
	}
	reencoded, err := json.Marshal(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var req putVisitorTagsRequest
	if err := json.Unmarshal(reencoded, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.TagDefinitionIDs == nil {
		req.TagDefinitionIDs = []string{}
	}

	actor := getActorFromRequest(r)
	ticket, err := h.service.SetVisitorTagsForTicket(id, req.TagDefinitionIDs, req.OperatorComment, actor)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrTicketVisitorWrongStatus),
			errors.Is(err, services.ErrVisitorAnonymousNotAllowed),
			errors.Is(err, services.ErrTicketNoVisitorForTags):
			http.Error(w, err.Error(), http.StatusConflict)
		case errors.Is(err, services.ErrVisitorTagsCommentRequired),
			errors.Is(err, services.ErrVisitorTagIDsNotInUnit),
			errors.Is(err, services.ErrOperatorCommentTooLong):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, gorm.ErrRecordNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		case errors.Is(err, services.ErrTagDefinitionIDsContainEmpty):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	RespondJSON(w, ticket)
}
