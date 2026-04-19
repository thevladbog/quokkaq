package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"
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
	LeadsTrackerQueue       string `json:"leadsTrackerQueue" binding:"required"`
	TrackerTypeRegistration string `json:"trackerTypeRegistration" binding:"required"`
	TrackerTypeRequest      string `json:"trackerTypeRequest" binding:"required"`
	TrackerTypeError        string `json:"trackerTypeError" binding:"required"`
	SupportTrackerQueue     string `json:"supportTrackerQueue" binding:"required"`
	TrackerTypeSupport      string `json:"trackerTypeSupport" binding:"required"`
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
