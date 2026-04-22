package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/netutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// WebhookEndpointsHandler manages outgoing webhook subscriptions.
type WebhookEndpointsHandler struct {
	db       *gorm.DB
	webhooks repository.WebhookEndpointRepository
	userRepo repository.UserRepository
	unitRepo repository.UnitRepository
}

func NewWebhookEndpointsHandler(db *gorm.DB, webhooks repository.WebhookEndpointRepository, userRepo repository.UserRepository, unitRepo repository.UnitRepository) *WebhookEndpointsHandler {
	return &WebhookEndpointsHandler{db: db, webhooks: webhooks, userRepo: userRepo, unitRepo: unitRepo}
}

func (h *WebhookEndpointsHandler) resolveCompany(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return "", false
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", false
	}
	return companyID, true
}

type webhookEndpointDTO struct {
	ID                  string   `json:"id"`
	CompanyID           string   `json:"companyId"`
	UnitID              *string  `json:"unitId,omitempty"`
	URL                 string   `json:"url"`
	EventTypes          []string `json:"eventTypes"`
	Enabled             bool     `json:"enabled"`
	ConsecutiveFailures int      `json:"consecutiveFailures"`
	SigningSecretMasked string   `json:"signingSecretMasked"`
	CreatedAt           string   `json:"createdAt"`
}

// createWebhookEndpointRequest is the JSON body for POST /companies/me/webhook-endpoints.
type createWebhookEndpointRequest struct {
	URL        string   `json:"url"`
	EventTypes []string `json:"eventTypes"`
	UnitID     *string  `json:"unitId,omitempty"`
	Enabled    *bool    `json:"enabled"`
}

type createWebhookEndpointResponse struct {
	Endpoint      webhookEndpointDTO `json:"endpoint"`
	SigningSecret string             `json:"signingSecret"`
}

func maskSecretLast4(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= 4 {
		return "****"
	}
	return "****" + s[len(s)-4:]
}

func (h *WebhookEndpointsHandler) toDTO(ep *models.WebhookEndpoint) webhookEndpointDTO {
	var types []string
	_ = json.Unmarshal(ep.EventTypes, &types)
	return webhookEndpointDTO{
		ID:                  ep.ID,
		CompanyID:           ep.CompanyID,
		UnitID:              ep.UnitID,
		URL:                 ep.URL,
		EventTypes:          types,
		Enabled:             ep.Enabled,
		ConsecutiveFailures: ep.ConsecutiveFailures,
		SigningSecretMasked: maskSecretLast4(ep.SigningSecret),
		CreatedAt:           ep.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}

// ListWebhookEndpoints godoc
// @Summary      List webhook endpoints
// @Tags         integrations
// @Security     BearerAuth
// @Produce      json
// @Success      200 {array} handlers.webhookEndpointDTO
// @Router       /companies/me/webhook-endpoints [get]
func (h *WebhookEndpointsHandler) List(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	rows, err := h.webhooks.ListByCompany(r.Context(), companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]webhookEndpointDTO, 0, len(rows))
	for i := range rows {
		out = append(out, h.toDTO(&rows[i]))
	}
	RespondJSON(w, out)
}

// CreateWebhookEndpoint godoc
// @Summary      Create webhook endpoint
// @Tags         integrations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body createWebhookEndpointRequest true "Webhook endpoint"
// @Success      201 {object} createWebhookEndpointResponse
// @Router       /companies/me/webhook-endpoints [post]
func (h *WebhookEndpointsHandler) Create(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	okPlan, err := subscriptionfeatures.CompanyHasOutboundWebhooks(r.Context(), h.db, companyID)
	if err != nil || !okPlan {
		http.Error(w, "outgoing webhooks are not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	var req createWebhookEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	url := strings.TrimSpace(req.URL)
	if url == "" || !netutil.WebhookTargetURLAllowed(url) {
		http.Error(w, "invalid or disallowed webhook URL", http.StatusBadRequest)
		return
	}
	types := make([]string, 0, len(req.EventTypes))
	for _, t := range req.EventTypes {
		t = strings.TrimSpace(t)
		if t != "" {
			types = append(types, t)
		}
	}
	if len(types) == 0 {
		http.Error(w, "eventTypes is required", http.StatusBadRequest)
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	var unitID *string
	if req.UnitID != nil && strings.TrimSpace(*req.UnitID) != "" {
		u := strings.TrimSpace(*req.UnitID)
		unit, uerr := h.unitRepo.FindByIDLight(u)
		if uerr != nil || unit == nil || unit.CompanyID != companyID {
			http.Error(w, "invalid unitId", http.StatusBadRequest)
			return
		}
		unitID = &u
	}
	secretBytes := make([]byte, 32)
	if _, err := rand.Read(secretBytes); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	signingSecret := hex.EncodeToString(secretBytes)
	row := models.WebhookEndpoint{
		CompanyID:     companyID,
		UnitID:        unitID,
		URL:           url,
		SigningSecret: signingSecret,
		EventTypes:    mustJSONScopes(types),
		Enabled:       enabled,
	}
	if err := h.webhooks.Create(r.Context(), &row); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, createWebhookEndpointResponse{
		Endpoint:      h.toDTO(&row),
		SigningSecret: signingSecret,
	})
}

// DeleteWebhookEndpoint godoc
// @Summary      Delete webhook endpoint
// @Tags         integrations
// @Security     BearerAuth
// @Param        id path string true "Endpoint ID"
// @Success      204
// @Router       /companies/me/webhook-endpoints/{id} [delete]
func (h *WebhookEndpointsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if err := h.webhooks.Delete(r.Context(), id, companyID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
