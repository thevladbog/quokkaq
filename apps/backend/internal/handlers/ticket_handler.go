package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"quokkaq-go-backend/internal/logger"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/localeutil"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/publicqueuewidget"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"quokkaq-go-backend/internal/subscriptionfeatures"
	"quokkaq-go-backend/pkg/database"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type TicketHandler struct {
	service     services.TicketService
	operational *services.OperationalService
	eta         *services.ETAService
	unitService services.UnitService
	settingsSvc *services.DeploymentSaaSSettingsService
	db          *gorm.DB
}

var (
	unitQueueStatusCacheMu   sync.Mutex
	unitQueueStatusCacheData = make(map[string]queueStatusCacheEntry)
)

type queueStatusCacheEntry struct {
	at   time.Time
	body []byte
}

const (
	unitQueueStatusCacheTTL        = 10 * time.Second
	unitQueueStatusCacheMaxEntries = 2000
)

func loadQueueStatusFromCache(unitID string) ([]byte, bool) {
	unitQueueStatusCacheMu.Lock()
	defer unitQueueStatusCacheMu.Unlock()
	e, ok := unitQueueStatusCacheData[unitID]
	if !ok {
		return nil, false
	}
	if time.Since(e.at) > unitQueueStatusCacheTTL {
		delete(unitQueueStatusCacheData, unitID)
		return nil, false
	}
	return e.body, true
}

func storeQueueStatusCache(unitID string, body []byte) {
	b := make([]byte, len(body))
	copy(b, body)
	now := time.Now()
	unitQueueStatusCacheMu.Lock()
	defer unitQueueStatusCacheMu.Unlock()
	for id, ent := range unitQueueStatusCacheData {
		if now.Sub(ent.at) > unitQueueStatusCacheTTL {
			delete(unitQueueStatusCacheData, id)
		}
	}
	unitQueueStatusCacheData[unitID] = queueStatusCacheEntry{at: now, body: b}
	if len(unitQueueStatusCacheData) > unitQueueStatusCacheMaxEntries {
		var oldestID string
		var oldestAt time.Time
		first := true
		for id, ent := range unitQueueStatusCacheData {
			if first || ent.at.Before(oldestAt) {
				first = false
				oldestAt = ent.at
				oldestID = id
			}
		}
		if oldestID != "" {
			delete(unitQueueStatusCacheData, oldestID)
		}
	}
}

func (h *TicketHandler) orm() *gorm.DB {
	if h.db != nil {
		return h.db
	}
	return database.DB
}

func NewTicketHandler(service services.TicketService, operational *services.OperationalService) *TicketHandler {
	return &TicketHandler{service: service, operational: operational}
}

// NewTicketHandlerWithETA creates a TicketHandler with ETA support.
func NewTicketHandlerWithETA(service services.TicketService, operational *services.OperationalService, eta *services.ETAService) *TicketHandler {
	return &TicketHandler{service: service, operational: operational, eta: eta}
}

// NewTicketHandlerFull creates a TicketHandler with all optional services wired.
// db is used for subscription/plan checks on public routes (e.g. queue-status); when nil, database.DB is used.
func NewTicketHandlerFull(service services.TicketService, operational *services.OperationalService, eta *services.ETAService, unitService services.UnitService, db *gorm.DB) *TicketHandler {
	return &TicketHandler{service: service, operational: operational, eta: eta, unitService: unitService, db: db}
}

// WithSettingsService attaches the deployment SaaS settings service (needed for smsOptInAvailable check).
func (h *TicketHandler) WithSettingsService(svc *services.DeploymentSaaSSettingsService) *TicketHandler {
	h.settingsSvc = svc
	return h
}

// CreateTicketRequest is the JSON body for POST /units/{unitId}/tickets (unit comes from the path).
type CreateTicketRequest struct {
	ServiceID     string  `json:"serviceId" binding:"required"`
	ClientID      *string `json:"clientId,omitempty"`
	VisitorPhone  *string `json:"visitorPhone,omitempty"`
	VisitorLocale *string `json:"visitorLocale,omitempty"`
}

// CreateTicket godoc
// @ID           createUnitTicket
// @Summary      Create a new ticket
// @Description  Creates a new ticket for a service in a unit. Unit is taken from the path; body requires serviceId. Optional clientId (staff) or visitorPhone+visitorLocale (kiosk identification, en|ru); clientId and visitorPhone are mutually exclusive.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        unitId  path      string              true  "Unit ID"
// @Param        request body      CreateTicketRequest true  "Ticket Request"
// @Success      201  {object}  models.Ticket
// @Failure      400  {string}  string "Bad Request"
// @Failure      402  {object}  handlers.QuotaExceededError "Quota Exceeded"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /units/{unitId}/tickets [post]
func (h *TicketHandler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req CreateTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	serviceID := strings.TrimSpace(req.ServiceID)
	if serviceID == "" {
		http.Error(w, "serviceId is required", http.StatusBadRequest)
		return
	}

	// Use unitID from URL, ignore what's in body if any
	var staffClientID *string
	if req.ClientID != nil && strings.TrimSpace(*req.ClientID) != "" {
		s := strings.TrimSpace(*req.ClientID)
		staffClientID = &s
	}
	var visitorPhone *string
	if req.VisitorPhone != nil && strings.TrimSpace(*req.VisitorPhone) != "" {
		vp := strings.TrimSpace(*req.VisitorPhone)
		visitorPhone = &vp
	}
	var visitorLocale *string
	if req.VisitorLocale != nil && strings.TrimSpace(*req.VisitorLocale) != "" {
		vl := strings.TrimSpace(*req.VisitorLocale)
		visitorLocale = &vl
	}
	if staffClientID != nil && visitorPhone != nil {
		http.Error(w, services.ErrTicketCreateVisitorConflict.Error(), http.StatusBadRequest)
		return
	}

	if h.operational != nil && visitorPhone != nil {
		frozen, err := h.operational.IsKioskFrozen(unitID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if frozen {
			http.Error(w, "kiosk admission is frozen for end-of-day operations", http.StatusServiceUnavailable)
			return
		}
	}

	actor := getActorFromRequest(r)
	ticket, err := h.service.CreateTicket(unitID, serviceID, staffClientID, visitorPhone, visitorLocale, actor)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrTicketQuotaExhausted):
			writeQuotaExceeded(w, "tickets_per_month", err)
			return
		case errors.Is(err, services.ErrTicketServiceNotInUnit),
			errors.Is(err, services.ErrVisitorAnonymousNotAllowed),
			errors.Is(err, services.ErrTicketCreateClientNotInUnit),
			errors.Is(err, services.ErrDuplicateClientPhone),
			errors.Is(err, services.ErrTicketCreateVisitorConflict),
			errors.Is(err, localeutil.ErrKioskVisitorLocaleInvalid),
			errors.Is(err, services.ErrVisitorPhoneInvalid):
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if h.operational != nil {
		op, uid := h.operational, unitID
		go func() {
			defer func() {
				if rec := recover(); rec != nil {
					logger.PrintfCtx(r.Context(), "CreateTicket WakeStatisticsIfQuiet panic (unitID=%q): %v", uid, rec)
				}
			}()
			op.WakeStatisticsIfQuiet(uid)
		}()
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, ticket)
}

// ticketWithExtras wraps a Ticket for the public GET response, adding virtual fields that depend on platform settings.
type ticketWithExtras struct {
	*models.Ticket
	SmsOptInAvailable bool `json:"smsOptInAvailable"`
}

// GetTicketByID godoc
// @Summary      Get ticket by ID
// @Description  Retrieves a ticket by its ID. For waiting tickets, also returns queuePosition and estimatedWaitSeconds.
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
	// Enrich with ETA for waiting tickets when service is available.
	if h.eta != nil && ticket.Status == "waiting" {
		if result, etaErr := h.eta.QueuePositionAndETA(ticket); etaErr == nil && result.Position > 0 {
			ticket.QueuePosition = &result.Position
			if result.EstimatedWaitSec > 0 {
				ticket.EstimatedWaitSeconds = &result.EstimatedWaitSec
			}
		}
	}

	// Compute smsOptInAvailable: SMS must be effectively active (including env overrides) and the
	// company must have the visitor_notifications plan feature. Guard against nil unitService which
	// can occur when the handler is wired without full service dependencies.
	smsOptIn := false
	if h.settingsSvc != nil && h.unitService != nil && ticket.Status == "waiting" {
		settings, sErr := h.settingsSvc.GetIntegrationSettings()
		if sErr == nil {
			provider := services.NewSMSProviderFromSettings(settings)
			if provider.Name() != "log" {
				unit, uErr := h.unitService.GetUnitByID(ticket.UnitID)
				if uErr == nil {
					if ok, _ := services.CompanyHasPlanFeature(unit.CompanyID, "visitor_notifications"); ok {
						smsOptIn = true
					}
				}
			}
		}
	}

	RespondJSON(w, ticketWithExtras{Ticket: ticket, SmsOptInAvailable: smsOptIn})
}

// GetTicketsByUnit godoc
// @Summary      Get tickets by unit
// @Description  Subdivision: all non-EOD tickets for that unit (all service zones + subdivision-wide pool). Service zone: non-EOD tickets for the parent subdivision with service_zone_id equal to this zone's id.
// @Tags         tickets
// @Produce      json
// @Param        unitId path      string  true  "Unit ID (subdivision or service_zone)"
// @Success      200    {array}   models.Ticket
// @Failure      404    {string}  string "Unit not found"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/tickets [get]
func (h *TicketHandler) GetTicketsByUnit(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	tickets, err := h.service.GetTicketsByUnit(unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "unit not found", http.StatusNotFound)
			return
		}
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
// @Description  Calls the next waiting ticket for a unit. Request body is required and must include counterId. Optional serviceIds (or legacy serviceId) limit the queue; omit or empty filter means all services in the unit.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        unitId  path      string           true  "Unit ID"
// @Param        request body      CallNextRequest  true  "counterId (required) and optional serviceIds or legacy serviceId filter"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      404     {string}  string "Not found (e.g. unknown counter or no waiting tickets)"
// @Failure      409     {string}  string "Counter on break"
// @Failure      500     {string}  string "Internal Server Error"
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
		if errors.Is(err, services.ErrCounterUnitMismatch) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrCounterOnBreak) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrNoWaitingTickets) || errors.Is(err, gorm.ErrRecordNotFound) {
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
		if errors.Is(err, services.ErrTicketCounterZoneMismatch) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	RespondJSON(w, ticket)
}

// TransferRequest documents POST /tickets/{id}/transfer JSON (partial updates supported via raw decode in handler).
type TransferRequest struct {
	ToCounterID     *string `json:"toCounterId,omitempty"`
	ToUserID        *string `json:"toUserId,omitempty"`
	ToServiceZoneID *string `json:"toServiceZoneId,omitempty"`
	ToServiceID     *string `json:"toServiceId,omitempty"`
	OperatorComment *string `json:"operatorComment,omitempty" extensions:"x-nullable"`
}

// Transfer godoc
// @Summary      Transfer ticket
// @Description  Transfers a ticket to another counter or user, or to a service zone (optional service change, queue number preserved). Optional operatorComment updates atomically.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id       path      string           true  "Ticket ID"
// @Param        request  body      TransferRequest  true  "Transfer Request"
// @Success      200      {object}  models.Ticket
// @Failure      400      {string}  string "Bad request (validation / transfer rules)"
// @Failure      404      {string}  string "Ticket not found"
// @Failure      500      {string}  string "Internal server error"
// @Router       /tickets/{id}/transfer [post]
func (h *TicketHandler) Transfer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rawBody := map[string]json.RawMessage{}
	if err := json.NewDecoder(r.Body).Decode(&rawBody); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	in := services.TransferTicketInput{}
	if v, ok := rawBody["toCounterId"]; ok && len(v) > 0 && string(v) != "null" {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, "toCounterId invalid", http.StatusBadRequest)
			return
		}
		if t := strings.TrimSpace(s); t != "" {
			in.ToCounterID = &t
		}
	}
	if v, ok := rawBody["toUserId"]; ok && len(v) > 0 && string(v) != "null" {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, "toUserId invalid", http.StatusBadRequest)
			return
		}
		if t := strings.TrimSpace(s); t != "" {
			in.ToUserID = &t
		}
	}
	if v, ok := rawBody["toServiceZoneId"]; ok && len(v) > 0 && string(v) != "null" {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, "toServiceZoneId invalid", http.StatusBadRequest)
			return
		}
		if t := strings.TrimSpace(s); t != "" {
			in.ToServiceZoneID = &t
		}
	}
	if v, ok := rawBody["toServiceId"]; ok && len(v) > 0 && string(v) != "null" {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			http.Error(w, "toServiceId invalid", http.StatusBadRequest)
			return
		}
		if t := strings.TrimSpace(s); t != "" {
			in.ToServiceID = &t
		}
	}
	if v, ok := rawBody["operatorComment"]; ok {
		in.OperatorCommentUpdate = true
		b := bytes.TrimSpace(v)
		if len(b) == 0 || string(b) == "null" {
			in.OperatorComment = nil
		} else {
			var s string
			if err := json.Unmarshal(b, &s); err != nil {
				http.Error(w, "operatorComment must be a string or null", http.StatusBadRequest)
				return
			}
			in.OperatorComment = &s
		}
	}

	actor := getActorFromRequest(r)
	ticket, err := h.service.Transfer(id, in, actor)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrTransferConflictingTargets),
			errors.Is(err, services.ErrTransferConflictingCounterAndUser),
			errors.Is(err, services.ErrTransferTargetRequired),
			errors.Is(err, services.ErrTicketCounterZoneMismatch),
			errors.Is(err, services.ErrInvalidServiceZone),
			errors.Is(err, services.ErrTransferServiceRequiredForZone),
			errors.Is(err, services.ErrTransferTargetMustBeLeafService),
			errors.Is(err, services.ErrTransferTargetServiceNotInZone),
			errors.Is(err, services.ErrTransferServiceNotAllowedOnTargetCounter),
			errors.Is(err, services.ErrOperatorCommentTooLong),
			errors.Is(err, services.ErrTicketServiceNotInUnit),
			errors.Is(err, services.ErrCounterUnitMismatch):
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		case errors.Is(err, services.ErrCounterNotFoundForUser):
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
				errors.Is(err, services.ErrVisitorNameRequired) ||
				errors.Is(err, services.ErrVisitorPhoneInvalid) {
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

// validateVisitorToken reads the X-Visitor-Token header, fetches the ticket by id, and returns
// false (writing an appropriate HTTP error) if the token is absent or does not match.
// Returns true when the token is valid and the handler may proceed.
func (h *TicketHandler) validateVisitorToken(w http.ResponseWriter, r *http.Request, ticketID string) bool {
	token := strings.TrimSpace(r.Header.Get("X-Visitor-Token"))
	if token == "" {
		http.Error(w, "X-Visitor-Token header is required", http.StatusForbidden)
		return false
	}
	ticket, err := h.service.GetTicketByID(ticketID)
	if err != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return false
	}
	if ticket.VisitorToken != token {
		http.Error(w, "invalid visitor token", http.StatusForbidden)
		return false
	}
	return true
}

// VisitorCancelTicket godoc
// @ID           visitorCancelTicket
// @Summary      Cancel a waiting ticket (visitor self-service)
// @Description  Allows a visitor to cancel their own waiting ticket. Only tickets in 'waiting' status can be cancelled this way. Requires the X-Visitor-Token header matching the token issued at ticket creation.
// @Tags         tickets
// @Produce      json
// @Param        id                path      string  true  "Ticket ID"
// @Param        X-Visitor-Token   header    string  true  "Visitor ownership token"
// @Success      200 {object}  models.Ticket
// @Failure      403 {string}  string "Forbidden"
// @Failure      404 {string}  string "Ticket not found"
// @Failure      409 {string}  string "Ticket cannot be cancelled"
// @Failure      500 {string}  string "Internal Server Error"
// @Router       /tickets/{id}/cancel [post]
func (h *TicketHandler) VisitorCancelTicket(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Validate visitor ownership token before mutating.
	if !h.validateVisitorToken(w, r, id) {
		return
	}

	ticket, err := h.service.VisitorCancelTicket(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "ticket not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrTicketNotCancellable) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, ticket)
}

// AttachPhoneRequest is the body for POST /tickets/{id}/phone.
type AttachPhoneRequest struct {
	Phone  string `json:"phone"`
	Locale string `json:"locale"`
}

// AttachPhone godoc
// @ID           attachTicketPhone
// @Summary      Attach phone number to a ticket for SMS opt-in
// @Description  Associates a phone number with the visitor of a waiting ticket so they receive SMS notifications. Only valid while the ticket is in 'waiting' status. Normalizes and validates the phone to E.164 format. Requires X-Visitor-Token header.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        id                path      string              true  "Ticket ID"
// @Param        X-Visitor-Token   header    string              true  "Visitor ownership token"
// @Param        request           body      AttachPhoneRequest  true  "Phone opt-in request"
// @Success      200     {object}  models.Ticket
// @Failure      400     {string}  string "Bad Request"
// @Failure      403     {string}  string "Forbidden"
// @Failure      404     {string}  string "Ticket not found"
// @Failure      409     {string}  string "Ticket no longer in waiting state"
// @Router       /tickets/{id}/phone [post]
func (h *TicketHandler) AttachPhone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Validate visitor ownership token before accepting PII.
	if !h.validateVisitorToken(w, r, id) {
		return
	}

	var req AttachPhoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}

	phoneE164, err := phoneutil.ParseAndNormalize(phone, phoneutil.DefaultRegion())
	if err != nil {
		http.Error(w, "invalid phone number", http.StatusBadRequest)
		return
	}

	locale := strings.TrimSpace(req.Locale)
	if locale == "" {
		locale = "ru"
	}

	ticket, tErr := h.service.GetTicketByID(id)
	if tErr != nil {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	}
	if ticket.Status != "waiting" {
		http.Error(w, "ticket is not in waiting state", http.StatusConflict)
		return
	}

	// Enforce SMS feature gate before accepting PII.
	if h.settingsSvc != nil && h.unitService != nil {
		smsSettings, sErr := h.settingsSvc.GetIntegrationSettings()
		if sErr != nil || services.NewSMSProviderFromSettings(smsSettings).Name() == "log" {
			http.Error(w, "SMS notifications are not configured", http.StatusForbidden)
			return
		}
		if unit, uErr := h.unitService.GetUnitByID(ticket.UnitID); uErr == nil {
			if ok, _ := services.CompanyHasPlanFeature(unit.CompanyID, "visitor_notifications"); !ok {
				http.Error(w, "visitor notifications feature not available on current plan", http.StatusForbidden)
				return
			}
		}
	}

	updated, aErr := h.service.AttachPhoneToTicket(id, phoneE164, locale)
	if aErr != nil {
		if errors.Is(aErr, services.ErrTicketNotWaiting) {
			http.Error(w, aErr.Error(), http.StatusConflict)
			return
		}
		http.Error(w, aErr.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, updated)
}

// GetUnitQueueStatus godoc
// @ID           getUnitQueueStatus
// @Summary      Get public queue status for a unit
// @Description  Returns queue length, estimated wait time (minutes), and active counter count. Public endpoint, no authentication required. Requires subscription plan feature public_queue_widget.
// @Tags         tickets
// @Produce      json
// @Param        unitId  path      string  true  "Unit ID"
// @Param        token   query     string  false "Optional embed JWT from POST /companies/me/public-widget-token"
// @Success      200     {object}  services.UnitQueueSummary
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /units/{unitId}/queue-status [get]
func (h *TicketHandler) GetUnitQueueStatus(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	if h.unitService == nil {
		http.Error(w, "widget authorization not configured", http.StatusInternalServerError)
		return
	}
	unit, uerr := h.unitService.GetUnitByID(unitID)
	if uerr != nil || unit == nil {
		http.Error(w, "unit not found", http.StatusNotFound)
		return
	}
	ok, ferr := subscriptionfeatures.CompanyHasPublicQueueWidget(r.Context(), h.orm(), unit.CompanyID)
	if ferr != nil || !ok {
		http.Error(w, "public queue widget is not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	if qtok := strings.TrimSpace(r.URL.Query().Get("token")); qtok != "" && publicqueuewidget.SecretConfigured() {
		wid, cid, verr := publicqueuewidget.Verify(qtok)
		if verr != nil || !strings.EqualFold(wid, unitID) || cid != unit.CompanyID {
			http.Error(w, "invalid widget token", http.StatusUnauthorized)
			return
		}
	}
	var co models.Company
	if err := h.orm().WithContext(r.Context()).Where("id = ?", unit.CompanyID).First(&co).Error; err == nil {
		origins := publicqueuewidget.AllowedOriginsFromCompanySettings(co.Settings)
		if o := strings.TrimSpace(r.Header.Get("Origin")); len(origins) > 0 && o != "" {
			allowed := false
			for _, a := range origins {
				if a == o {
					allowed = true
					break
				}
			}
			if !allowed {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Add("Vary", "Origin")
		}
	}
	if h.eta == nil {
		RespondJSON(w, map[string]interface{}{
			"queueLength":          0,
			"estimatedWaitMinutes": 0.0,
			"activeCounters":       0,
		})
		return
	}
	if cached, ok := loadQueueStatusFromCache(unitID); ok {
		var summary services.UnitQueueSummary
		if err := json.Unmarshal(cached, &summary); err == nil {
			RespondJSON(w, summary)
			return
		}
		unitQueueStatusCacheMu.Lock()
		delete(unitQueueStatusCacheData, unitID)
		unitQueueStatusCacheMu.Unlock()
	}
	summary, err := h.eta.GetUnitQueueSummary(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	body, err := json.Marshal(summary)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	storeQueueStatusCache(unitID, body)
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

// GetIntegrationUnitQueueSummary godoc
// @ID           getIntegrationUnitQueueSummary
// @Summary      Queue summary for integration API (same payload as public queue-status, authenticated by integration key)
// @Tags         integrations
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Success      200 {object} services.UnitQueueSummary
// @Router       /integrations/v1/units/{unitId}/queue-summary [get]
func (h *TicketHandler) GetIntegrationUnitQueueSummary(w http.ResponseWriter, r *http.Request) {
	unitID := strings.TrimSpace(chi.URLParam(r, "unitId"))
	if unitID == "" {
		http.Error(w, "unitId required", http.StatusBadRequest)
		return
	}
	if h.eta == nil {
		RespondJSON(w, map[string]interface{}{
			"queueLength":          0,
			"estimatedWaitMinutes": 0.0,
			"activeCounters":       0,
		})
		return
	}
	summary, err := h.eta.GetUnitQueueSummary(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, summary)
}

// VirtualQueueJoinRequest is the body for POST /units/{unitId}/virtual-queue.
type VirtualQueueJoinRequest struct {
	ServiceID string `json:"serviceId"`
	Phone     string `json:"phone"`
	Locale    string `json:"locale"`
}

// VirtualQueueJoinResponse wraps the created ticket and a visitor-facing page URL.
type VirtualQueueJoinResponse struct {
	Ticket        interface{} `json:"ticket"`
	TicketPageURL string      `json:"ticketPageUrl"`
}

// JoinVirtualQueue godoc
// @ID           joinVirtualQueue
// @Summary      Join a virtual queue remotely
// @Description  Allows a visitor to join a unit's queue remotely without visiting the kiosk. Requires the unit to have virtualQueue.enabled=true in its config and the company to have the virtual_queue feature. Phone is required for status SMS notifications (optional if not used). Returns the created ticket and a link to the ticket tracking page.
// @Tags         tickets
// @Accept       json
// @Produce      json
// @Param        unitId  path      string                    true  "Unit ID"
// @Param        request body      VirtualQueueJoinRequest   true  "Join request"
// @Success      201     {object}  VirtualQueueJoinResponse
// @Failure      400     {string}  string "Bad Request"
// @Failure      403     {string}  string "Virtual queue not enabled for this unit"
// @Failure      402     {object}  handlers.QuotaExceededError "Quota Exceeded"
// @Failure      503     {string}  string "Service Unavailable (kiosk frozen)"
// @Router       /units/{unitId}/virtual-queue [post]
func (h *TicketHandler) JoinVirtualQueue(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")

	// Check unit exists and has virtual queue enabled.
	if h.unitService == nil {
		http.Error(w, "service unavailable", http.StatusInternalServerError)
		return
	}
	unit, err := h.unitService.GetUnitByID(unitID)
	if err != nil {
		http.Error(w, "unit not found", http.StatusNotFound)
		return
	}
	if !unitVirtualQueueEnabled(unit.Config) {
		http.Error(w, "virtual queue is not enabled for this unit", http.StatusForbidden)
		return
	}
	// Check plan feature.
	if ok, fErr := services.CompanyHasPlanFeature(unit.CompanyID, "virtual_queue"); fErr != nil || !ok {
		http.Error(w, "virtual queue feature not available on current plan", http.StatusForbidden)
		return
	}

	var req VirtualQueueJoinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	serviceID := strings.TrimSpace(req.ServiceID)
	if serviceID == "" {
		http.Error(w, "serviceId is required", http.StatusBadRequest)
		return
	}

	if h.operational != nil {
		frozen, err := h.operational.IsKioskFrozen(unitID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if frozen {
			http.Error(w, "queue admission is currently closed", http.StatusServiceUnavailable)
			return
		}
	}

	locale := strings.TrimSpace(req.Locale)
	if locale == "" {
		locale = "ru"
	}

	var visitorPhone *string
	var visitorLocale *string
	phone := strings.TrimSpace(req.Phone)
	if phone != "" {
		visitorPhone = &phone
		visitorLocale = &locale
	}

	ticket, err := h.service.CreateTicket(unitID, serviceID, nil, visitorPhone, visitorLocale, nil)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrTicketQuotaExhausted):
			writeQuotaExceeded(w, "tickets_per_month", err)
			return
		case errors.Is(err, services.ErrTicketServiceNotInUnit),
			errors.Is(err, services.ErrVisitorAnonymousNotAllowed),
			errors.Is(err, services.ErrVisitorPhoneInvalid),
			errors.Is(err, localeutil.ErrKioskVisitorLocaleInvalid):
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	ticketURL := fmt.Sprintf("%s/%s/ticket/%s", baseURL, locale, ticket.ID)

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, VirtualQueueJoinResponse{
		Ticket:        ticket,
		TicketPageURL: ticketURL,
	})
}

// unitVirtualQueueEnabled reads config.virtualQueue.enabled from a unit's JSONB config.
func unitVirtualQueueEnabled(configRaw json.RawMessage) bool {
	if len(configRaw) == 0 || string(configRaw) == "null" {
		return false
	}
	var cfg map[string]json.RawMessage
	if err := json.Unmarshal(configRaw, &cfg); err != nil {
		return false
	}
	vqRaw, ok := cfg["virtualQueue"]
	if !ok {
		return false
	}
	var vq struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.Unmarshal(vqRaw, &vq); err != nil {
		return false
	}
	return vq.Enabled
}
