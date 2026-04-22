package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"gorm.io/gorm"
)

// WebhookDeliveryLogsHandler lists webhook delivery attempts for the active tenant.
type WebhookDeliveryLogsHandler struct {
	db       *gorm.DB
	userRepo repository.UserRepository
}

func NewWebhookDeliveryLogsHandler(db *gorm.DB, userRepo repository.UserRepository) *WebhookDeliveryLogsHandler {
	return &WebhookDeliveryLogsHandler{db: db, userRepo: userRepo}
}

func (h *WebhookDeliveryLogsHandler) resolveCompany(w http.ResponseWriter, r *http.Request) (string, bool) {
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

type webhookDeliveryLogDTO struct {
	ID                string  `json:"id"`
	WebhookEndpointID string  `json:"webhookEndpointId"`
	TicketHistoryID   *string `json:"ticketHistoryId,omitempty"`
	HTTPStatus        *int    `json:"httpStatus,omitempty"`
	DurationMs        int     `json:"durationMs"`
	ErrorMessage      string  `json:"errorMessage,omitempty"`
	Attempt           int     `json:"attempt"`
	CreatedAt         string  `json:"createdAt"`
}

// ListWebhookDeliveryLogs godoc
// @Summary      List webhook delivery logs
// @Tags         integrations
// @Security     BearerAuth
// @Param        endpointId query string false "Filter by webhook endpoint id"
// @Param        limit query int false "Max rows (default 50, max 200)"
// @Success      200 {array} handlers.webhookDeliveryLogDTO
// @Router       /companies/me/webhook-delivery-logs [get]
func (h *WebhookDeliveryLogsHandler) List(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	okPlan, err := subscriptionfeatures.CompanyHasOutboundWebhooks(r.Context(), h.db, companyID)
	if err != nil || !okPlan {
		http.Error(w, "outgoing webhooks are not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	epID := strings.TrimSpace(r.URL.Query().Get("endpointId"))
	if epID != "" {
		_, err := repository.NewWebhookEndpointRepository(h.db).GetByIDAndCompany(r.Context(), epID, companyID)
		if err != nil {
			http.Error(w, "invalid endpointId", http.StatusBadRequest)
			return
		}
	}
	limit := 50
	if ls := strings.TrimSpace(r.URL.Query().Get("limit")); ls != "" {
		if n, err := strconv.Atoi(ls); err == nil {
			limit = n
		}
	}
	rows, err := repository.ListWebhookDeliveryLogsForCompany(r.Context(), h.db, companyID, epID, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]webhookDeliveryLogDTO, 0, len(rows))
	for i := range rows {
		row := &rows[i]
		out = append(out, webhookDeliveryLogDTO{
			ID:                row.ID,
			WebhookEndpointID: row.WebhookEndpointID,
			TicketHistoryID:   row.TicketHistoryID,
			HTTPStatus:        row.HTTPStatus,
			DurationMs:        row.DurationMs,
			ErrorMessage:      row.ErrorMessage,
			Attempt:           row.Attempt,
			CreatedAt:         row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	RespondJSON(w, out)
}
