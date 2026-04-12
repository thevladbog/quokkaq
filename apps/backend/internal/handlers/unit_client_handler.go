package handlers

import (
	"errors"
	"net/http"

	"quokkaq-go-backend/internal/models"
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
func (h *UnitClientHandler) SearchClients(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	q := r.URL.Query().Get("q")
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
