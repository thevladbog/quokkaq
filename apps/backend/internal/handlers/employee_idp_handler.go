package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/ssocrypto"
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
	row, err := h.repo.GetSettingByUnitID(unitID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = &models.UnitEmployeeIdpSetting{UnitID: unitID, HTTPMethod: "POST", HeaderTemplatesJSON: "[]", TimeoutMS: 10000}
	}
	if req.Enabled != nil {
		row.Enabled = *req.Enabled
	}
	if req.HTTPMethod != nil {
		row.HTTPMethod = *req.HTTPMethod
	}
	if req.UpstreamURL != nil {
		row.UpstreamURL = *req.UpstreamURL
	}
	if req.RequestBodyTemplate != nil {
		row.RequestBodyTemplate = *req.RequestBodyTemplate
	}
	if req.ResponseEmailPath != nil {
		row.ResponseEmailPath = *req.ResponseEmailPath
	}
	if req.ResponseDisplayNamePath != nil {
		row.ResponseDisplayNamePath = *req.ResponseDisplayNamePath
	}
	if req.HeaderTemplatesJSON != nil {
		row.HeaderTemplatesJSON = *req.HeaderTemplatesJSON
	}
	if req.TimeoutMS != nil {
		row.TimeoutMS = *req.TimeoutMS
	}
	if err := h.repo.SaveSetting(row); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, name := range req.SecretNamesToDelete {
		n := strings.TrimSpace(name)
		if n == "" {
			continue
		}
		if err := h.repo.DeleteSecret(unitID, n); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	for name, plain := range req.SecretValues {
		n := name
		if n == "" {
			continue
		}
		enc, encErr := ssocrypto.EncryptAES256GCM([]byte(plain))
		if encErr != nil {
			http.Error(w, encErr.Error(), http.StatusInternalServerError)
			return
		}
		_ = h.repo.UpsertSecret(&models.UnitEmployeeIdpSecret{UnitID: unitID, Name: n, Ciphertext: enc})
	}
	row2, err2 := h.repo.GetSettingByUnitID(unitID)
	if err2 != nil {
		http.Error(w, err2.Error(), http.StatusInternalServerError)
		return
	}
	secs, _ := h.repo.ListSecrets(unitID)
	names := make([]string, 0, len(secs))
	for i := range secs {
		names = append(names, secs[i].Name)
	}
	RespondJSON(w, unitEmployeeIdpSettingsDTO{
		UnitID:                  row2.UnitID,
		Enabled:                 row2.Enabled,
		HTTPMethod:              row2.HTTPMethod,
		UpstreamURL:             row2.UpstreamURL,
		RequestBodyTemplate:     row2.RequestBodyTemplate,
		ResponseEmailPath:       row2.ResponseEmailPath,
		ResponseDisplayNamePath: row2.ResponseDisplayNamePath,
		HeaderTemplatesJSON:     row2.HeaderTemplatesJSON,
		TimeoutMS:               row2.TimeoutMS,
		SecretNames:             names,
	})
}
