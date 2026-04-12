package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type UnitClientHandler struct {
	clientService services.UnitClientService
	ticketService services.TicketService
}

func NewUnitClientHandler(clientService services.UnitClientService, ticketService services.TicketService) *UnitClientHandler {
	return &UnitClientHandler{
		clientService: clientService,
		ticketService: ticketService,
	}
}

// ClientVisitsResponse is the JSON body for GET .../clients/{id}/visits.
type ClientVisitsResponse struct {
	Items      []models.Ticket `json:"items"`
	NextCursor *string         `json:"nextCursor,omitempty"`
}

// SearchClients godoc
// @Summary      Search unit clients (visitors)
// @Description  Search by phone (exact when parseable) and by name; excludes anonymous aggregate client.
// @Tags         clients
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Param        q      query     string  true  "Search query"
// @Success      200    {array}   models.UnitClient
// @Failure      400    {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/clients/search [get]
func parseUnitClientTagIDsQuery(q string) []string {
	q = strings.TrimSpace(q)
	if q == "" {
		return nil
	}
	parts := strings.Split(q, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// ListUnitClients godoc
// @Summary      List unit clients (paginated)
// @Description  Non-anonymous clients in the unit. Optional q filters by name or phone; tagIds (comma-separated) keeps clients that have any of the tags (OR). Keyset cursor in nextCursor.
// @Tags         clients
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path      string  true  "Unit ID"
// @Param        q       query     string  false "Search by name or phone"
// @Param        tagIds  query     string  false "Comma-separated tag definition IDs (OR)"
// @Param        limit   query     int     false "Page size (default 20, max 100)"
// @Param        cursor  query     string  false "Opaque pagination cursor"
// @Success      200     {object}  services.UnitClientListResponse
// @Failure      400     {string}  string "Bad Request"
// @Failure      401     {string}  string "Unauthorized"
// @Failure      403     {string}  string "Forbidden"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /units/{unitId}/clients [get]
func (h *UnitClientHandler) ListUnitClients(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	tagIDs := parseUnitClientTagIDsQuery(r.URL.Query().Get("tagIds"))
	limit := clampQueryPageLimit(r.URL.Query().Get("limit"))
	var cur *string
	if c := strings.TrimSpace(r.URL.Query().Get("cursor")); c != "" {
		cur = &c
	}
	resp, err := h.clientService.ListForUnit(unitID, q, tagIDs, limit, cur)
	if err != nil {
		if errors.Is(err, services.ErrInvalidUnitClientListCursor) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetUnitClient godoc
// @Summary      Get unit client by ID
// @Description  Non-anonymous client with tag definitions preloaded.
// @Tags         clients
// @Produce      json
// @Security     BearerAuth
// @Param        unitId   path      string  true  "Unit ID"
// @Param        clientId path      string  true  "Client ID"
// @Success      200      {object}  models.UnitClient
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not Found"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/clients/{clientId} [get]
func (h *UnitClientHandler) GetUnitClient(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	clientID := chi.URLParam(r, "clientId")
	c, err := h.clientService.GetByIDInUnitWithDefinitions(unitID, clientID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, c)
}

// PatchUnitClientRequest is the JSON body for PATCH .../clients/{clientId}.
type PatchUnitClientRequest struct {
	FirstName        *string   `json:"firstName"`
	LastName         *string   `json:"lastName"`
	Phone            *string   `json:"phone"`
	TagDefinitionIDs *[]string `json:"tagDefinitionIds"`
}

// PatchUnitClient godoc
// @Summary      Update unit client
// @Description  Partial update: omitted fields unchanged. Phone is raw input (normalized to E.164); empty string clears phone. tagDefinitionIds replaces the full tag set when present (including empty array).
// @Tags         clients
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId   path      string  true  "Unit ID"
// @Param        clientId path      string  true  "Client ID"
// @Param        body     body      PatchUnitClientRequest true  "Fields to update"
// @Success      200      {object}  models.UnitClient
// @Failure      400      {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not Found"
// @Failure      409    {string}  string "Conflict"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /units/{unitId}/clients/{clientId} [patch]
func (h *UnitClientHandler) PatchUnitClient(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	clientID := chi.URLParam(r, "clientId")
	var req PatchUnitClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	err := h.clientService.PatchClient(unitID, clientID, req.FirstName, req.LastName, req.Phone, req.TagDefinitionIDs, getActorFromRequest(r))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, phoneutil.ErrInvalidPhone) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, repository.ErrDuplicateUnitClientPhone) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		msg := err.Error()
		if strings.Contains(msg, "cannot both be empty") || strings.Contains(msg, "must not contain empty") || strings.Contains(msg, "invalid for this unit") {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	c, err := h.clientService.GetByIDInUnitWithDefinitions(unitID, clientID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, c)
}

func (h *UnitClientHandler) SearchClients(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		http.Error(w, "q is required", http.StatusBadRequest)
		return
	}
	clients, err := h.clientService.SearchForUnit(unitID, q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if clients == nil {
		clients = []models.UnitClient{}
	}
	RespondJSON(w, clients)
}

// ListClientVisits godoc
// @Summary      List past visits for a client
// @Description  Tickets linked to the client in this unit; empty for anonymous client.
// @Tags         clients
// @Produce      json
// @Security     BearerAuth
// @Param        unitId   path      string  true  "Unit ID"
// @Param        clientId path      string  true  "Client ID"
// @Param        limit    query     int     false "Page size (default 20, max 100)"
// @Param        cursor   query     string  false "Pagination cursor from previous nextCursor"
// @Success      200      {object}  handlers.ClientVisitsResponse
// @Failure      400      {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not Found"
// @Router       /units/{unitId}/clients/{clientId}/visits [get]
func (h *UnitClientHandler) ListClientVisits(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	clientID := chi.URLParam(r, "clientId")
	limit := clampQueryPageLimit(r.URL.Query().Get("limit"))
	var cursor *string
	if c := r.URL.Query().Get("cursor"); c != "" {
		cursor = &c
	}
	items, next, err := h.ticketService.ListVisitsByClient(unitID, clientID, limit, cursor)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "client not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrClientVisitsInvalidCursor) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, ClientVisitsResponse{Items: items, NextCursor: next})
}

// ListClientHistory godoc
// @Summary      List profile and tag change history for a client
// @Description  Audit rows for CRM patches and staff ticket flows (newest first). Keyset cursor in nextCursor.
// @Tags         clients
// @Produce      json
// @Security     BearerAuth
// @Param        unitId   path      string  true  "Unit ID"
// @Param        clientId path      string  true  "Client ID"
// @Param        limit    query     int     false "Page size (default 20, max 100)"
// @Param        cursor   query     string  false "Pagination cursor from previous nextCursor"
// @Success      200      {object}  services.UnitClientHistoryListResponse
// @Failure      400      {string}  string "Bad Request"
// @Failure      401    {string}  string "Unauthorized"
// @Failure      403    {string}  string "Forbidden"
// @Failure      404    {string}  string "Not Found"
// @Router       /units/{unitId}/clients/{clientId}/history [get]
func (h *UnitClientHandler) ListClientHistory(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	clientID := chi.URLParam(r, "clientId")
	limit := clampQueryPageLimit(r.URL.Query().Get("limit"))
	var cursor *string
	if c := r.URL.Query().Get("cursor"); c != "" {
		cursor = &c
	}
	resp, err := h.clientService.ListHistoryForClient(unitID, clientID, limit, cursor)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "client not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, repository.ErrUnitClientHistoryInvalidCursor) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}
