package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// EmployeeIdpHandler exposes public resolve and (authenticated) unit IdP settings.
type EmployeeIdpHandler struct {
	idp  *services.EmployeeIdpService
	repo *repository.EmployeeIdpRepository
	db   *gorm.DB
}

func NewEmployeeIdpHandler(idp *services.EmployeeIdpService, repo *repository.EmployeeIdpRepository, db *gorm.DB) *EmployeeIdpHandler {
	return &EmployeeIdpHandler{idp: idp, repo: repo, db: db}
}

// PostPublicEmployeeIdpResolve godoc
// @Summary  Resolve employee badge or login against tenant IdP
// @Description Authenticated kiosk session (access.kiosk or terminal JWT). Resolves against unit HTTPS template; does not return raw upstream body.
// @Tags     kiosk
// @Accept   json
// @Param    unitId path string true "Unit ID"
// @Param    body body services.EmployeeIdpResolveRequest true "kind + raw"
// @Success 200 {object} services.EmployeeIdpResolveResponse "matchStatus: matched|no_user|ambiguous (userId set only for matched; ambiguous when >1 user shares email in company)"
// @Failure  400,403,429,502,500 {string} string "Error message; 429 = rate limit"
// @Router   /units/{unitId}/employee-idp/resolve [post]
func (h *EmployeeIdpHandler) PostPublicEmployeeIdpResolve(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var body services.EmployeeIdpResolveRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	res, err := h.idp.ResolveKiosk(r.Context(), unitID, body)
	if err != nil {
		outcome := "error_internal"
		switch {
		case errors.Is(err, services.ErrEmployeeIdpEmptyInput):
			outcome = "empty_input"
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, services.ErrEmployeeIdpDisabled), errors.Is(err, services.ErrEmployeeIdpPlan):
			outcome = "disabled_or_plan"
			http.Error(w, err.Error(), http.StatusForbidden)
		case errors.Is(err, services.ErrEmployeeIdpBadUpstream), errors.Is(err, services.ErrEmployeeIdpUpstream), errors.Is(err, services.ErrEmployeeIdpMap):
			outcome = "upstream_error"
			http.Error(w, err.Error(), http.StatusBadGateway)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		logger.InfoContext(r.Context(), "employee_idp.resolve",
			slog.String("unit_id", unitID),
			slog.String("outcome", outcome))
		return
	}
	logger.InfoContext(r.Context(), "employee_idp.resolve",
		slog.String("unit_id", unitID),
		slog.String("outcome", res.MatchStatus))
	RespondJSON(w, res)
}

// unitEmployeeIdpSettingsDTO is a safe view (no secrets).
type unitEmployeeIdpSettingsDTO struct {
	UnitID                  string   `json:"unitId"`
	Enabled                 bool     `json:"enabled"`
	HTTPMethod              string   `json:"httpMethod"`
	UpstreamURL             string   `json:"upstreamUrl"`
	RequestBodyTemplate     string   `json:"requestBodyTemplate"`
	ResponseEmailPath       string   `json:"responseEmailPath"`
	ResponseDisplayNamePath string   `json:"responseDisplayNamePath"`
	ResponseGroupsPath      string   `json:"responseGroupsPath"`
	HeaderTemplatesJSON     string   `json:"headerTemplatesJson"`
	TimeoutMS               int      `json:"timeoutMs"`
	SecretNames             []string `json:"secretNames"`
}

// GetUnitEmployeeIdp returns settings and secret name list (not values).
func (h *EmployeeIdpHandler) GetUnitEmployeeIdp(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	row, err := h.repo.GetSettingByUnitID(unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			RespondJSON(w, unitEmployeeIdpSettingsDTO{UnitID: unitID, HTTPMethod: "POST", HeaderTemplatesJSON: "[]", TimeoutMS: 10000})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	secs, _ := h.repo.ListSecrets(unitID)
	names := make([]string, 0, len(secs))
	for i := range secs {
		names = append(names, secs[i].Name)
	}
	RespondJSON(w, unitEmployeeIdpSettingsDTO{
		UnitID:                  row.UnitID,
		Enabled:                 row.Enabled,
		HTTPMethod:              row.HTTPMethod,
		UpstreamURL:             row.UpstreamURL,
		RequestBodyTemplate:     row.RequestBodyTemplate,
		ResponseEmailPath:       row.ResponseEmailPath,
		ResponseDisplayNamePath: row.ResponseDisplayNamePath,
		ResponseGroupsPath:      row.ResponseGroupsPath,
		HeaderTemplatesJSON:     row.HeaderTemplatesJSON,
		TimeoutMS:               row.TimeoutMS,
		SecretNames:             names,
	})
}

// PatchUnitEmployeeIdpRequest updates IdP config; optional new secrets.
type PatchUnitEmployeeIdpRequest struct {
	Enabled                 *bool   `json:"enabled,omitempty"`
	HTTPMethod              *string `json:"httpMethod,omitempty"`
	UpstreamURL             *string `json:"upstreamUrl,omitempty"`
	RequestBodyTemplate     *string `json:"requestBodyTemplate,omitempty"`
	ResponseEmailPath       *string `json:"responseEmailPath,omitempty"`
	ResponseDisplayNamePath *string `json:"responseDisplayNamePath,omitempty"`
	ResponseGroupsPath      *string `json:"responseGroupsPath,omitempty"`
	HeaderTemplatesJSON     *string `json:"headerTemplatesJson,omitempty"`
	TimeoutMS               *int    `json:"timeoutMs,omitempty"`
	// Secrets: name -> plaintext; stored encrypted. Omitted names unchanged.
	SecretValues        map[string]string `json:"secretValues,omitempty"`
	SecretNamesToDelete []string          `json:"secretNamesToDelete,omitempty"`
}

// PatchUnitEmployeeIdp godoc
// @Summary  Update unit external employee IdP (HTTPS) settings
// @Description Authenticated; permission unit.employee_idp.manage. Optional secretValues (encrypted); secretNamesToDelete removes named stored secrets.
// @Tags     units
// @Accept   json
// @Param    unitId path string true "Unit ID"
// @Param    body body handlers.PatchUnitEmployeeIdpRequest true "Settings and secrets"
// @Success  200 {object} unitEmployeeIdpSettingsDTO
// @Failure  400,500 {string} string "Error message"
// @Router   /units/{unitId}/employee-idp [patch]
// PatchUnitEmployeeIdp updates settings, optional new secrets, and optional secret deletions.
func (h *EmployeeIdpHandler) PatchUnitEmployeeIdp(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req PatchUnitEmployeeIdpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, names, err := h.idp.UpdateSettings(unitID, services.EmployeeIdpSettingsPatch{
		Enabled: req.Enabled, HTTPMethod: req.HTTPMethod, UpstreamURL: req.UpstreamURL,
		RequestBodyTemplate: req.RequestBodyTemplate, ResponseEmailPath: req.ResponseEmailPath,
		ResponseDisplayNamePath: req.ResponseDisplayNamePath, ResponseGroupsPath: req.ResponseGroupsPath,
		HeaderTemplatesJSON: req.HeaderTemplatesJSON, TimeoutMS: req.TimeoutMS,
		SecretValues: req.SecretValues, SecretNamesToDelete: req.SecretNamesToDelete,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, unitEmployeeIdpSettingsDTO{
		UnitID: row.UnitID, Enabled: row.Enabled, HTTPMethod: row.HTTPMethod,
		UpstreamURL: row.UpstreamURL, RequestBodyTemplate: row.RequestBodyTemplate,
		ResponseEmailPath: row.ResponseEmailPath, ResponseDisplayNamePath: row.ResponseDisplayNamePath,
		ResponseGroupsPath:  row.ResponseGroupsPath,
		HeaderTemplatesJSON: row.HeaderTemplatesJSON, TimeoutMS: row.TimeoutMS,
		SecretNames: names,
	})
}
