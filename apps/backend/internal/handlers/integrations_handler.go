package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// IntegrationsHandler exposes SaaS deployment integration settings (platform admin).
type IntegrationsHandler struct {
	settingsRepo repository.DeploymentSaaSSettingsRepository
}

// NewIntegrationsHandler constructs IntegrationsHandler.
func NewIntegrationsHandler(settingsRepo repository.DeploymentSaaSSettingsRepository) *IntegrationsHandler {
	return &IntegrationsHandler{settingsRepo: settingsRepo}
}

// PlatformIntegrationsResponse is the JSON body for GET/PATCH /platform/integrations.
type PlatformIntegrationsResponse struct {
	LeadsTrackerQueue       string `json:"leadsTrackerQueue"`
	TrackerTypeRegistration string `json:"trackerTypeRegistration"`
	TrackerTypeRequest      string `json:"trackerTypeRequest"`
	TrackerTypeError        string `json:"trackerTypeError"`
	SupportTrackerQueue     string `json:"supportTrackerQueue"`
	TrackerTypeSupport      string `json:"trackerTypeSupport"`
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
// @Failure      500  {string}  string  "Internal Server Error"
// @Router       /platform/integrations [get]
// @Security     BearerAuth
func (h *IntegrationsHandler) GetPlatformIntegrations(w http.ResponseWriter, r *http.Request) {
	row, err := h.settingsRepo.Get()
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
// @Param        body  body      PlatformIntegrationsResponse  true  "Integration settings"
// @Success      200   {object}  PlatformIntegrationsResponse
// @Failure      400   {string}  string  "Bad request"
// @Failure      500   {string}  string  "Internal Server Error"
// @Router       /platform/integrations [patch]
// @Security     BearerAuth
func (h *IntegrationsHandler) PatchPlatformIntegrations(w http.ResponseWriter, r *http.Request) {
	var body PlatformIntegrationsResponse
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	row := &models.DeploymentSaaSSettings{
		ID:                      models.DeploymentSaaSSettingsSingletonID,
		LeadsTrackerQueue:       body.LeadsTrackerQueue,
		TrackerTypeRegistration: body.TrackerTypeRegistration,
		TrackerTypeRequest:      body.TrackerTypeRequest,
		TrackerTypeError:        body.TrackerTypeError,
		SupportTrackerQueue:     body.SupportTrackerQueue,
		TrackerTypeSupport:      body.TrackerTypeSupport,
	}
	if err := h.settingsRepo.Upsert(row); err != nil {
		http.Error(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}
	saved, err := h.settingsRepo.Get()
	if err != nil {
		http.Error(w, "Failed to load settings", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settingsToResponse(saved))
}
