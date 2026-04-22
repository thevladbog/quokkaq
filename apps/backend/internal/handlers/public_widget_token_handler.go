package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/publicqueuewidget"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"gorm.io/gorm"
)

// PublicWidgetTokenHandler mints short-lived JWTs for embedding public queue status.
type PublicWidgetTokenHandler struct {
	db       *gorm.DB
	userRepo repository.UserRepository
	unitRepo repository.UnitRepository
}

func NewPublicWidgetTokenHandler(db *gorm.DB, userRepo repository.UserRepository, unitRepo repository.UnitRepository) *PublicWidgetTokenHandler {
	return &PublicWidgetTokenHandler{db: db, userRepo: userRepo, unitRepo: unitRepo}
}

func (h *PublicWidgetTokenHandler) resolveCompany(w http.ResponseWriter, r *http.Request) (string, bool) {
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

type issuePublicWidgetTokenRequest struct {
	UnitID     string `json:"unitId"`
	TTLSeconds int    `json:"ttlSeconds"`
}

type issuePublicWidgetTokenResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expiresInSeconds"`
}

// IssuePublicWidgetToken godoc
// @Summary      Mint a short-lived JWT for the public queue status widget
// @Tags         integrations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body issuePublicWidgetTokenRequest true "Payload"
// @Success      200 {object} issuePublicWidgetTokenResponse
// @Router       /companies/me/public-widget-token [post]
func (h *PublicWidgetTokenHandler) Issue(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	okFeat, err := subscriptionfeatures.CompanyHasPublicQueueWidget(r.Context(), h.db, companyID)
	if err != nil || !okFeat {
		http.Error(w, "public queue widget is not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	if !publicqueuewidget.SecretConfigured() {
		http.Error(w, "PUBLIC_WIDGET_JWT_SECRET is not set; public widget token signing is disabled on this server", http.StatusServiceUnavailable)
		return
	}
	var req issuePublicWidgetTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	unitID := strings.TrimSpace(req.UnitID)
	if unitID == "" {
		http.Error(w, "unitId is required", http.StatusBadRequest)
		return
	}
	u, err := h.unitRepo.FindByIDLight(unitID)
	if err != nil || u == nil || u.CompanyID != companyID {
		http.Error(w, "invalid unitId", http.StatusBadRequest)
		return
	}
	ttl := 15 * 60
	if req.TTLSeconds > 0 {
		ttl = req.TTLSeconds
	}
	if ttl < 60 {
		ttl = 60
	}
	if ttl > 86400 {
		ttl = 86400
	}
	tok, err := publicqueuewidget.Sign(unitID, companyID, time.Duration(ttl)*time.Second)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, issuePublicWidgetTokenResponse{Token: tok, ExpiresIn: ttl})
}

type publicQueueWidgetSettingsDTO struct {
	AllowedOrigins []string `json:"allowedOrigins"`
}

// GetPublicQueueWidgetSettings godoc
// @Summary      Get CORS allowlist origins for the public queue widget
// @Tags         integrations
// @Security     BearerAuth
// @Produce      json
// @Success      200 {object} publicQueueWidgetSettingsDTO
// @Router       /companies/me/public-queue-widget-settings [get]
func (h *PublicWidgetTokenHandler) GetPublicQueueWidgetSettings(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	okFeat, err := subscriptionfeatures.CompanyHasPublicQueueWidget(r.Context(), h.db, companyID)
	if err != nil || !okFeat {
		http.Error(w, "public queue widget is not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	var co models.Company
	if err := h.db.WithContext(r.Context()).Where("id = ?", companyID).First(&co).Error; err != nil {
		http.Error(w, "company not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, publicQueueWidgetSettingsDTO{
		AllowedOrigins: publicqueuewidget.AllowedOriginsFromCompanySettings(co.Settings),
	})
}

// PatchPublicQueueWidgetSettings godoc
// @Summary      Set CORS allowlist origins for the public queue widget
// @Tags         integrations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body publicQueueWidgetSettingsDTO true "Allowlist (empty clears CORS restriction)"
// @Success      200 {object} publicQueueWidgetSettingsDTO
// @Router       /companies/me/public-queue-widget-settings [patch]
func (h *PublicWidgetTokenHandler) PatchPublicQueueWidgetSettings(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	okFeat, err := subscriptionfeatures.CompanyHasPublicQueueWidget(r.Context(), h.db, companyID)
	if err != nil || !okFeat {
		http.Error(w, "public queue widget is not enabled for this subscription plan", http.StatusForbidden)
		return
	}
	var req publicQueueWidgetSettingsDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.AllowedOrigins == nil {
		req.AllowedOrigins = []string{}
	}
	var co models.Company
	if err := h.db.WithContext(r.Context()).Where("id = ?", companyID).First(&co).Error; err != nil {
		http.Error(w, "company not found", http.StatusNotFound)
		return
	}
	merged, err := publicqueuewidget.MergeAllowedOriginsIntoCompanySettings(co.Settings, req.AllowedOrigins)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	co.Settings = merged
	if err := h.db.WithContext(r.Context()).Save(&co).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, publicQueueWidgetSettingsDTO{
		AllowedOrigins: publicqueuewidget.AllowedOriginsFromCompanySettings(co.Settings),
	})
}
