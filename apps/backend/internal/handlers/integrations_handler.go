package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/services"
	"strings"
)

// IntegrationsHandler exposes SaaS deployment integration settings (platform admin).
type IntegrationsHandler struct {
	svc *services.DeploymentSaaSSettingsService
}

// NewIntegrationsHandler constructs IntegrationsHandler.
func NewIntegrationsHandler(svc *services.DeploymentSaaSSettingsService) *IntegrationsHandler {
	return &IntegrationsHandler{svc: svc}
}

// PlatformIntegrationsResponse is the JSON body for GET /platform/integrations.
type PlatformIntegrationsResponse struct {
	LeadsTrackerQueue       string `json:"leadsTrackerQueue"`
	TrackerTypeRegistration string `json:"trackerTypeRegistration"`
	TrackerTypeRequest      string `json:"trackerTypeRequest"`
	TrackerTypeError        string `json:"trackerTypeError"`
	SupportTrackerQueue     string `json:"supportTrackerQueue"`
	TrackerTypeSupport      string `json:"trackerTypeSupport"`
	// SMS integration (credentials are masked in read; never returned in plaintext).
	SmsProvider     string `json:"smsProvider"`
	SmsApiKeyMasked string `json:"smsApiKeyMasked"` // e.g. "****abcd" — last 4 chars only
	SmsFromName     string `json:"smsFromName"`
	SmsEnabled      bool   `json:"smsEnabled"`
}

// maskSecret returns a masked version of a secret (last 4 chars visible, rest starred).
func maskSecret(s string) string {
	if len(s) <= 4 {
		return strings.Repeat("*", len(s))
	}
	return strings.Repeat("*", len(s)-4) + s[len(s)-4:]
}

func settingsToResponse(row *models.DeploymentSaaSSettings) PlatformIntegrationsResponse {
	if row == nil {
		return PlatformIntegrationsResponse{}
	}
	return PlatformIntegrationsResponse{
		LeadsTrackerQueue:       row.LeadsTrackerQueue,
		TrackerTypeRegistration: row.TrackerTypeRegistration,
		TrackerTypeRequest:      row.TrackerTypeRequest,
		TrackerTypeError:        row.TrackerTypeError,
		SupportTrackerQueue:     row.SupportTrackerQueue,
		TrackerTypeSupport:      row.TrackerTypeSupport,
		SmsProvider:             row.SmsProvider,
		SmsApiKeyMasked:         maskSecret(row.SmsApiKey),
		SmsFromName:             row.SmsFromName,
		SmsEnabled:              row.SmsEnabled,
	}
}

// GetPlatformIntegrations godoc
// @ID           getPlatformIntegrations
// @Summary      Get deployment integration settings
// @Description  SaaS operator: Yandex Tracker queue and issue type mappings for leads flows.
// @Tags         platform
// @Produce      json
// @Success      200  {object}  PlatformIntegrationsResponse
// @Failure      401  {string}  string  "Unauthorized"
// @Failure      403  {string}  string  "Forbidden"
// @Failure      500  {string}  string  "Internal Server Error"
// @Router       /platform/integrations [get]
// @Security     BearerAuth
func (h *IntegrationsHandler) GetPlatformIntegrations(w http.ResponseWriter, r *http.Request) {
	row, err := h.svc.GetIntegrationSettings()
	if err != nil {
		http.Error(w, "Failed to load settings", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settingsToResponse(row))
}

// PatchPlatformIntegrations godoc
// @ID           patchPlatformIntegrations
// @Summary      Update deployment integration settings
// @Tags         platform
// @Accept       json
// @Produce      json
// @Param        body  body      services.DeploymentSaaSSettingsPatch  true  "Fields to update (omit keys to leave unchanged)"
// @Success      200   {object}  PlatformIntegrationsResponse
// @Failure      400   {string}  string  "Bad request"
// @Failure      401   {string}  string  "Unauthorized"
// @Failure      403   {string}  string  "Forbidden"
// @Failure      500   {string}  string  "Internal Server Error"
// @Router       /platform/integrations [patch]
// @Security     BearerAuth
func (h *IntegrationsHandler) PatchPlatformIntegrations(w http.ResponseWriter, r *http.Request) {
	var patch services.DeploymentSaaSSettingsPatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	saved, err := h.svc.PatchIntegrationSettings(&patch)
	if err != nil {
		http.Error(w, "Failed to update settings", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settingsToResponse(saved))
}

// TestSMSIntegrationRequest is the body for POST /platform/integrations/sms/test.
type TestSMSIntegrationRequest struct {
	// Phone number in E.164 format to send the test SMS to.
	Phone string `json:"phone"`
}

// TestSMSIntegration godoc
// @ID           testSMSIntegration
// @Summary      Send a test SMS to validate provider credentials
// @Description  Sends a test SMS using the currently saved SMS provider settings. Returns 200 on success.
// @Tags         platform
// @Accept       json
// @Produce      json
// @Param        body  body      TestSMSIntegrationRequest  true  "Target phone number"
// @Success      200   {object}  map[string]string  "ok"
// @Failure      400   {string}  string  "Bad request"
// @Failure      500   {string}  string  "SMS send failed"
// @Router       /platform/integrations/sms/test [post]
// @Security     BearerAuth
func (h *IntegrationsHandler) TestSMSIntegration(w http.ResponseWriter, r *http.Request) {
	var req TestSMSIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}
	normalized, err := phoneutil.ParseAndNormalize(phone, "")
	if err != nil {
		http.Error(w, "invalid phone number: "+err.Error(), http.StatusBadRequest)
		return
	}
	provider := h.svc.GetSMSProvider()
	if err := provider.Send(normalized, "QuokkaQ: тестовое сообщение / test message"); err != nil {
		http.Error(w, "SMS send failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "provider": provider.Name()})
}
