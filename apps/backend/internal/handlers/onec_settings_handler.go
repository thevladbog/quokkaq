package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services/commerceml"

	"golang.org/x/crypto/bcrypt"
)

// OneCSettingsHandler manages GET/PUT /companies/me/onec-settings.
type OneCSettingsHandler struct {
	companyRepo repository.CompanyRepository
	userRepo    repository.UserRepository
	onecRepo    repository.OneCSettingsRepository
}

func NewOneCSettingsHandler(
	companyRepo repository.CompanyRepository,
	userRepo repository.UserRepository,
	onecRepo repository.OneCSettingsRepository,
) *OneCSettingsHandler {
	return &OneCSettingsHandler{
		companyRepo: companyRepo,
		userRepo:    userRepo,
		onecRepo:    onecRepo,
	}
}

// GetMyOneCSettings godoc
// @ID           GetMyOneCSettings
// @Summary      Get 1С УНФ CommerceML settings for current company
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.CompanyOneCSettingsPublic
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/onec-settings [get]
func (h *OneCSettingsHandler) GetMyOneCSettings(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	h.respondOneCSettingsPublic(w, r, companyID)
}

// respondOneCSettingsPublic writes JSON for GET onec-settings (tenant or platform).
func (h *OneCSettingsHandler) respondOneCSettingsPublic(w http.ResponseWriter, r *http.Request, companyID string) {
	out := models.CompanyOneCSettingsPublic{
		CompanyID:         companyID,
		ExchangeEnabled:   false,
		HTTPLogin:         "",
		PasswordSet:       false,
		CommerceMLVersion: "2.10",
	}
	row, err := h.onecRepo.GetByCompanyID(companyID)
	if err != nil {
		if !errors.Is(err, repository.ErrOneCSettingsNotFound) {
			logger.ErrorfCtx(r.Context(), "onec Get: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
	} else {
		out.ExchangeEnabled = row.ExchangeEnabled
		out.HTTPLogin = row.HTTPLogin
		out.PasswordSet = row.HTTPPasswordBcrypt != ""
		out.CommerceMLVersion = row.CommerceMLVersion
		if out.CommerceMLVersion == "" {
			out.CommerceMLVersion = "2.10"
		}
		out.SitePaymentSystemName = row.SitePaymentSystemName
		if len(row.StatusMappingJSON) > 0 {
			var dto models.OneCStatusMappingDTO
			if err := json.Unmarshal(row.StatusMappingJSON, &dto); err != nil {
				logger.ErrorfCtx(r.Context(), "onec statusMapping json: %v", err)
			} else {
				out.StatusMapping = &dto
			}
		}
	}
	if base := onecPublicAPIBaseURL(); base != "" {
		out.ExchangeURLHint = base + "/commerceml/exchange"
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, out)
}

// PutMyOneCSettings godoc
// @ID           PutMyOneCSettings
// @Summary      Update 1С УНФ CommerceML settings for current company
// @Tags         companies
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      models.CompanyOneCSettingsPutRequest  true  "Settings"
// @Success      200  {object}  models.CompanyOneCSettingsPublic
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/me/onec-settings [put]
func (h *OneCSettingsHandler) PutMyOneCSettings(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	h.putOneCSettingsForCompany(w, r, companyID)
}

// putOneCSettingsForCompany applies PUT body to the given company (tenant or platform admin).
func (h *OneCSettingsHandler) putOneCSettingsForCompany(w http.ResponseWriter, r *http.Request, companyID string) {
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	var keyPresence map[string]json.RawMessage
	if err := json.Unmarshal(bodyBytes, &keyPresence); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	_, hasStatusMapping := keyPresence["statusMapping"]

	var body models.CompanyOneCSettingsPutBody
	if err := json.Unmarshal(bodyBytes, &body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	row := models.CompanyOneCSettings{
		CompanyID:          companyID,
		ExchangeEnabled:    false,
		HTTPLogin:          "",
		HTTPPasswordBcrypt: "",
		CommerceMLVersion:  "2.10",
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}

	existing, err := h.onecRepo.GetByCompanyID(companyID)
	if err == nil {
		row = *existing
	} else if !errors.Is(err, repository.ErrOneCSettingsNotFound) {
		logger.ErrorfCtx(r.Context(), "onec Put Get: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if body.ExchangeEnabled != nil {
		row.ExchangeEnabled = *body.ExchangeEnabled
	}
	if body.HTTPLogin != nil {
		row.HTTPLogin = strings.TrimSpace(*body.HTTPLogin)
	}
	if body.CommerceMLVersion != nil {
		v := strings.TrimSpace(*body.CommerceMLVersion)
		if v != "" {
			row.CommerceMLVersion = v
		}
	}
	if body.SitePaymentSystemName != nil {
		row.SitePaymentSystemName = strings.TrimSpace(*body.SitePaymentSystemName)
	}
	if body.HTTPPassword != nil {
		p := *body.HTTPPassword
		if strings.TrimSpace(p) == "" {
			row.HTTPPasswordBcrypt = ""
		} else {
			hash, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
			if err != nil {
				http.Error(w, "password hash error", http.StatusInternalServerError)
				return
			}
			row.HTTPPasswordBcrypt = string(hash)
		}
	}

	if hasStatusMapping {
		sm := bytes.TrimSpace(keyPresence["statusMapping"])
		if len(sm) == 0 || bytes.Equal(sm, []byte("null")) {
			row.StatusMappingJSON = nil
		} else {
			if err := commerceml.ValidateOneCStatusMapping(sm); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			row.StatusMappingJSON = append(json.RawMessage(nil), sm...)
		}
	}

	row.UpdatedAt = time.Now().UTC()
	if err := h.onecRepo.Upsert(&row); err != nil {
		logger.ErrorfCtx(r.Context(), "onec Upsert: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	out := models.CompanyOneCSettingsPublic{
		CompanyID:             row.CompanyID,
		ExchangeEnabled:       row.ExchangeEnabled,
		HTTPLogin:             row.HTTPLogin,
		PasswordSet:           row.HTTPPasswordBcrypt != "",
		CommerceMLVersion:     row.CommerceMLVersion,
		SitePaymentSystemName: row.SitePaymentSystemName,
	}
	if out.CommerceMLVersion == "" {
		out.CommerceMLVersion = "2.10"
	}
	if len(row.StatusMappingJSON) > 0 {
		var dto models.OneCStatusMappingDTO
		if err := json.Unmarshal(row.StatusMappingJSON, &dto); err != nil {
			logger.ErrorfCtx(r.Context(), "onec statusMapping json (put response): %v", err)
		} else {
			out.StatusMapping = &dto
		}
	}
	if base := onecPublicAPIBaseURL(); base != "" {
		out.ExchangeURLHint = base + "/commerceml/exchange"
	}
	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, out)
}

// GetPlatformCompanyOneCSettings godoc
// @ID           GetPlatformCompanyOneCSettings
// @Summary      Get 1С УНФ CommerceML settings for a company (SaaS operator)
// @Tags         platform
// @Produce      json
// @Security     BearerAuth
// @Param        id path string true "Company ID"
// @Success      200  {object}  models.CompanyOneCSettingsPublic
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /platform/companies/{id}/onec-settings [get]
func (h *OneCSettingsHandler) GetPlatformCompanyOneCSettings(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if _, err := h.companyRepo.FindByID(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "platform onec Get FindByID: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	h.respondOneCSettingsPublic(w, r, id)
}

// PutPlatformCompanyOneCSettings godoc
// @ID           PutPlatformCompanyOneCSettings
// @Summary      Update 1С УНФ CommerceML settings for a company (SaaS operator)
// @Tags         platform
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string                             true  "Company ID"
// @Param        body body  models.CompanyOneCSettingsPutRequest true  "Settings"
// @Success      200  {object}  models.CompanyOneCSettingsPublic
// @Failure      400  {string}  string "Bad request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "Not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /platform/companies/{id}/onec-settings [put]
func (h *OneCSettingsHandler) PutPlatformCompanyOneCSettings(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if _, err := h.companyRepo.FindByID(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "platform onec Put FindByID: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	h.putOneCSettingsForCompany(w, r, id)
}

func onecPublicAPIBaseURL() string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("API_PUBLIC_URL")), "/")
	if base != "" {
		return base
	}
	return strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_APP_URL")), "/")
}

func (h *OneCSettingsHandler) resolveCompanyID(w http.ResponseWriter, r *http.Request) (string, bool) {
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
		if repository.IsNotFound(err) {
			http.Error(w, "User has no associated company", http.StatusNotFound)
			return "", false
		}
		logger.ErrorfCtx(r.Context(), "onec ResolveCompanyIDForRequest: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return "", false
	}
	return companyID, true
}
