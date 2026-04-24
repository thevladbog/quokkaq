package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
)

// CompanyVisitorSMSHandler is tenant admin API for company.settings.visitorSms (BYOK) and delivery stats.
type CompanyVisitorSMSHandler struct {
	companyRepo repository.CompanyRepository
	userRepo    repository.UserRepository
	settingsSvc *services.DeploymentSaaSSettingsService
	funnelRepo  repository.QueueFunnelRepository
}

// NewCompanyVisitorSMSHandler constructs CompanyVisitorSMSHandler.
func NewCompanyVisitorSMSHandler(
	companyRepo repository.CompanyRepository,
	userRepo repository.UserRepository,
	settingsSvc *services.DeploymentSaaSSettingsService,
	funnelRepo repository.QueueFunnelRepository,
) *CompanyVisitorSMSHandler {
	return &CompanyVisitorSMSHandler{
		companyRepo: companyRepo,
		userRepo:    userRepo,
		settingsSvc: settingsSvc,
		funnelRepo:  funnelRepo,
	}
}

// CompanyVisitorSMSPublic is the read model for GET /companies/me/visitor-sms (no plaintext secrets).
type CompanyVisitorSMSPublic struct {
	SmsProvider     string `json:"smsProvider"`
	SmsApiKeyMasked string `json:"smsApiKeyMasked"`
	SmsFromName     string `json:"smsFromName"`
	SmsEnabled      bool   `json:"smsEnabled"`
	// ResolvedSource is tenant | platform | log (resolved outbound route for visitor SMS).
	ResolvedSource string `json:"resolvedSource"`
}

// GetVisitorSMS godoc
// @Summary      Get tenant visitor SMS settings (masked)
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant when user has multiple orgs"
// @Success      200  {object}  CompanyVisitorSMSPublic
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      404  {string}  string  "Not found"
// @Router       /companies/me/visitor-sms [get]
func (h *CompanyVisitorSMSHandler) GetVisitorSMS(w http.ResponseWriter, r *http.Request) {
	company, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	settings, sErr := h.settingsSvc.GetIntegrationSettings()
	if sErr != nil {
		http.Error(w, "failed to load platform settings", http.StatusInternalServerError)
		return
	}
	section, _ := services.VisitorSMSSectionFromCompany(company)
	_, src := services.ResolveSMSProviderForCompany(company, settings)
	pub := CompanyVisitorSMSPublic{
		SmsProvider:     strings.TrimSpace(section.SmsProvider),
		SmsFromName:     strings.TrimSpace(section.SmsFromName),
		SmsApiKeyMasked: services.MaskedSMSApiKey(section.SmsApiKey),
		SmsEnabled:      section.SmsEnabled,
		ResolvedSource:  src,
	}
	// If key too short, mask as integrations do
	if len(section.SmsApiKey) > 0 && len(pub.SmsApiKeyMasked) < 4 {
		pub.SmsApiKeyMasked = "****"
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pub)
}

// CompanyVisitorSMSPut is the body for PUT /companies/me/visitor-sms (replaces the visitorSms JSON object).
type CompanyVisitorSMSPut = services.CompanyVisitorSMSSection

// PutVisitorSMS godoc
// @Summary      Set tenant visitor SMS (BYOK) section
// @Tags         companies
// @Accept       json
// @Param        X-Company-Id header string false "Tenant when user has multiple orgs"
// @Param        body  body  CompanyVisitorSMSPut  true  "Visitor SMS section"
// @Success      200  {object}  CompanyVisitorSMSPublic
// @Security     BearerAuth
// @Router       /companies/me/visitor-sms [put]
func (h *CompanyVisitorSMSHandler) PutVisitorSMS(w http.ResponseWriter, r *http.Request) {
	company, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	var body services.CompanyVisitorSMSSection
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if prev, had := services.VisitorSMSSectionFromCompany(company); had {
		if strings.TrimSpace(body.SmsApiKey) == "" {
			body.SmsApiKey = prev.SmsApiKey
		}
		if strings.TrimSpace(body.SmsApiSecret) == "" {
			body.SmsApiSecret = prev.SmsApiSecret
		}
	}
	merged, mErr := services.MergeVisitorSMSSectionIntoCompanySettings(company.Settings, body)
	if mErr != nil {
		logger.PrintfCtx(r.Context(), "PutVisitorSMS merge: %v", mErr)
		http.Error(w, "invalid settings", http.StatusBadRequest)
		return
	}
	company.Settings = merged
	if uErr := h.companyRepo.Update(company); uErr != nil {
		logger.PrintfCtx(r.Context(), "PutVisitorSMS update: %v", uErr)
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	// Re-read
	updated, lErr := h.companyRepo.FindByID(company.ID)
	if lErr != nil {
		http.Error(w, "reload failed", http.StatusInternalServerError)
		return
	}
	settings, sErr := h.settingsSvc.GetIntegrationSettings()
	if sErr != nil {
		http.Error(w, "failed to load platform settings", http.StatusInternalServerError)
		return
	}
	section, _ := services.VisitorSMSSectionFromCompany(updated)
	_, src := services.ResolveSMSProviderForCompany(updated, settings)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(CompanyVisitorSMSPublic{
		SmsProvider:     strings.TrimSpace(section.SmsProvider),
		SmsFromName:     strings.TrimSpace(section.SmsFromName),
		SmsApiKeyMasked: services.MaskedSMSApiKey(section.SmsApiKey),
		SmsEnabled:      section.SmsEnabled,
		ResolvedSource:  src,
	})
}

// CompanyVisitorSMSTestRequest is the JSON for POST /companies/me/visitor-sms/test.
type CompanyVisitorSMSTestRequest struct {
	Phone string `json:"phone" binding:"required"`
}

// PostVisitorSMSTest godoc
// @Summary      Send a test visitor SMS using tenant (or platform) resolution
// @Tags         companies
// @Param        X-Company-Id header string false "Tenant"
// @Param        body  body  CompanyVisitorSMSTestRequest  true  "phone E.164"
// @Success      200  {object}  map[string]string
// @Security     BearerAuth
// @Router       /companies/me/visitor-sms/test [post]
func (h *CompanyVisitorSMSHandler) PostVisitorSMSTest(w http.ResponseWriter, r *http.Request) {
	company, oks := h.resolveCompany(w, r)
	if !oks {
		return
	}
	if featOk, ferr := services.CompanyHasPlanFeature(company.ID, "visitor_notifications"); ferr != nil || !featOk {
		if ferr != nil {
			logger.PrintfCtx(r.Context(), "PostVisitorSMSTest feature: %v", ferr)
		}
		http.Error(w, "visitor notifications not enabled for this plan", http.StatusForbidden)
		return
	}
	var req CompanyVisitorSMSTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}
	normalized, perr := phoneutil.ParseAndNormalize(phone, "")
	if perr != nil {
		http.Error(w, "invalid phone: "+perr.Error(), http.StatusBadRequest)
		return
	}
	settings, sErr := h.settingsSvc.GetIntegrationSettings()
	if sErr != nil {
		http.Error(w, "platform settings", http.StatusInternalServerError)
		return
	}
	prov, src := services.ResolveSMSProviderForCompany(company, settings)
	if services.IsLogSMSProvider(prov) {
		http.Error(w, "no SMS provider configured (log)", http.StatusBadRequest)
		return
	}
	msg := "QuokkaQ: тест SMS посетителей / visitor SMS test"
	if err := prov.Send(normalized, msg); err != nil {
		http.Error(w, "SMS send failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":   "ok",
		"provider": prov.Name(),
		"source":   src,
	})
}

// CompanyVisitorNotifStats is JSON for GET /companies/me/visitor-notification-stats
type CompanyVisitorNotifStats struct {
	SmsPending  int64 `json:"smsPending"`
	SmsSent     int64 `json:"smsSent"`
	SmsFailed   int64 `json:"smsFailed"`
	PeriodDays7 bool  `json:"periodDays7"`
}

// GetVisitorNotificationStats godoc
// @Summary      SMS notification job counts (last 7 days) for observability
// @Tags         companies
// @Success      200  {object}  CompanyVisitorNotifStats
// @Security     BearerAuth
// @Router       /companies/me/visitor-notification-stats [get]
func (h *CompanyVisitorSMSHandler) GetVisitorNotificationStats(w http.ResponseWriter, r *http.Request) {
	company, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	pending, sent, failed, serr := h.funnelRepo.NotificationStatusCounts(company.ID)
	if serr != nil {
		logger.PrintfCtx(r.Context(), "GetVisitorNotificationStats: %v", serr)
		http.Error(w, "stats error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(CompanyVisitorNotifStats{
		SmsPending:  pending,
		SmsSent:     sent,
		SmsFailed:   failed,
		PeriodDays7: true,
	})
}

// resolveCompany loads the current tenant company. On failure the response is written; returns ok=false.
func (h *CompanyVisitorSMSHandler) resolveCompany(w http.ResponseWriter, r *http.Request) (*models.Company, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return nil, false
		}
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return nil, false
		}
		logger.PrintfCtx(r.Context(), "resolveCompany: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return nil, false
	}
	company, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		if repository.IsNotFound(err) {
			http.Error(w, "Company not found", http.StatusNotFound)
			return nil, false
		}
		logger.PrintfCtx(r.Context(), "FindByID: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return company, true
}
