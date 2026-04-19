package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"quokkaq-go-backend/internal/logger"
	"strings"
	"time"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/authcookie"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// SSOHandler exposes SSO and public tenant endpoints (unauthenticated).
type SSOHandler struct {
	sso *services.SSOService
}

func NewSSOHandler(sso *services.SSOService) *SSOHandler {
	return &SSOHandler{sso: sso}
}

type tenantHintRequest struct {
	Email string `json:"email"`
}

// TenantHint godoc
// @ID           authTenantHint
// @Summary      Resolve next login step from email (tenant hint)
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body tenantHintRequest true "Email"
// @Success      200  {object}  services.TenantHintResponse
// @Router       /auth/login/tenant-hint [post]
func (h *SSOHandler) TenantHint(w http.ResponseWriter, r *http.Request) {
	var body tenantHintRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Email) == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	out := h.sso.TenantHint(body.Email)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// PublicTenant godoc
// @ID           publicTenantBySlug
// @Summary      Public tenant metadata by slug
// @Tags         auth
// @Produce      json
// @Param        slug path string true "Tenant slug"
// @Success      200  {object}  services.PublicTenantResponse
// @Failure      404  {string}  string "Not found"
// @Router       /public/tenants/{slug} [get]
func (h *SSOHandler) PublicTenant(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	out, err := h.sso.PublicTenantBySlug(slug)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// LoginContext godoc
// @ID           authLoginContext
// @Summary      Resolve tenant context by opaque login token
// @Tags         auth
// @Produce      json
// @Param        token query string true "Opaque token"
// @Success      200  {object}  services.PublicTenantResponse
// @Router       /auth/login-context [get]
func (h *SSOHandler) LoginContext(w http.ResponseWriter, r *http.Request) {
	tok := strings.TrimSpace(r.URL.Query().Get("token"))
	out, err := h.sso.LoginContextByOpaqueToken(tok)
	if err != nil || out == nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// SSOAuthorize godoc
// @ID           authSSOAuthorize
// @Summary      Start SSO (OIDC or SAML — redirect to IdP)
// @Tags         auth
// @Param        tenant query string true "Tenant slug"
// @Param        locale query string false "UI locale for post-SSO redirects (en|ru)"
// @Success      302  "Redirect"
// @Router       /auth/sso/authorize [get]
func (h *SSOHandler) SSOAuthorize(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.URL.Query().Get("tenant"))
	uiLocale := strings.TrimSpace(r.URL.Query().Get("locale"))
	c, conn, err := h.sso.CompanyAndConnectionForTenantSlug(slug)
	if err != nil {
		http.Error(w, "tenant not found", http.StatusNotFound)
		return
	}
	if !conn.Enabled {
		http.Error(w, "SSO not configured", http.StatusBadRequest)
		return
	}
	if strings.EqualFold(strings.TrimSpace(conn.SSOProtocol), "saml") {
		_ = h.sso.BeginSAMLAuth(r.Context(), w, r, c, conn)
		return
	}
	_ = h.sso.BeginAuthorize(r.Context(), w, slug, uiLocale)
}

// SAMLMetadata godoc
// @ID           authSAMLMetadata
// @Summary      SAML SP metadata XML (register at IdP)
// @Tags         auth
// @Produce      application/xml
// @Param        tenant query string true "Tenant slug"
// @Success      200  {string}  string  "SP metadata XML"
// @Failure      404  {string}  string "Not found"
// @Router       /auth/saml/metadata [get]
func (h *SSOHandler) SAMLMetadata(w http.ResponseWriter, r *http.Request) {
	h.sso.HandleSAMLMetadata(r.Context(), w, r)
}

// SAMLACS godoc
// @ID           authSAMLACS
// @Summary      SAML Assertion Consumer Service (POST from IdP)
// @Tags         auth
// @Accept       x-www-form-urlencoded
// @Param        SAMLResponse formData string true "SAML Response (Base64)"
// @Param        RelayState   formData string false "Relay state from SP-initiated login"
// @Success      302  "Redirect to app with one-time code"
// @Failure      400  {string}  string "Bad request"
// @Router       /auth/saml/acs [post]
func (h *SSOHandler) SAMLACS(w http.ResponseWriter, r *http.Request) {
	h.sso.HandleSAMLACS(r.Context(), w, r)
}

// SSOCallback godoc
// @ID           authSSOCallback
// @Summary      OIDC callback
// @Tags         auth
// @Param        code  query  string  true  "Authorization code from IdP"
// @Param        state query  string  true  "OAuth state"
// @Success      302  "Redirect to app"
// @Router       /auth/sso/callback [get]
func (h *SSOHandler) SSOCallback(w http.ResponseWriter, r *http.Request) {
	h.sso.HandleCallback(r.Context(), w, r)
}

type ssoExchangeRequest struct {
	Code string `json:"code"`
}

// SSOExchange godoc
// @ID           authSSOExchange
// @Summary      Exchange one-time SSO code for JWT pair
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body ssoExchangeRequest true "One-time code"
// @Success      200  {object}  LoginSessionResponse
// @Router       /auth/sso/exchange [post]
func (h *SSOHandler) SSOExchange(w http.ResponseWriter, r *http.Request) {
	var body ssoExchangeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Code) == "" {
		http.Error(w, "code required", http.StatusBadRequest)
		return
	}
	pair, err := h.sso.ExchangeFinishCode(r.Context(), body.Code)
	if err != nil {
		if errors.Is(err, services.ErrUserInactive) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		http.Error(w, "invalid or expired code", http.StatusUnauthorized)
		return
	}
	authcookie.WriteSessionCookies(w, r, pair)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(LoginSessionResponse{
		Token:       pair.AccessToken,
		AccessToken: pair.AccessToken,
	})
}

// patchCompanySlugRequest is PATCH /companies/me/slug JSON body.
type patchCompanySlugRequest struct {
	Slug string `json:"slug" example:"acme-corp"`
}

// CompanySSOHTTP SSO admin endpoints for current company.
type CompanySSOHTTP struct {
	sso         *services.SSOService
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
}

func NewCompanySSOHTTP(sso *services.SSOService, userRepo repository.UserRepository, companyRepo repository.CompanyRepository) *CompanySSOHTTP {
	return &CompanySSOHTTP{sso: sso, userRepo: userRepo, companyRepo: companyRepo}
}

func (h *CompanySSOHTTP) resolveCompany(w http.ResponseWriter, r *http.Request) (*models.Company, bool) {
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
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return nil, false
	}
	c, err := h.companyRepo.FindByID(companyID)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return nil, false
	}
	return c, true
}

// GetCompanySSO godoc
// @ID           companiesMeSSOGet
// @Summary      Get SSO settings (OIDC or SAML)
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  services.CompanySSOGetResponse
// @Router       /companies/me/sso [get]
func (h *CompanySSOHTTP) GetCompanySSO(w http.ResponseWriter, r *http.Request) {
	c, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	out, err := h.sso.GetCompanySSO(c.ID)
	if err != nil {
		logger.PrintfCtx(r.Context(), "GetCompanySSO: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// PatchCompanySSO godoc
// @ID           companiesMeSSOPatch
// @Summary      Update SSO settings (OIDC or SAML)
// @Tags         companies
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  services.CompanySSOPatch  true  "SSO settings"
// @Success      204  "No Content"
// @Router       /companies/me/sso [patch]
func (h *CompanySSOHTTP) PatchCompanySSO(w http.ResponseWriter, r *http.Request) {
	c, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	var body services.CompanySSOPatch
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if err := h.sso.PatchCompanySSO(c, body); err != nil {
		logger.PrintfCtx(r.Context(), "PatchCompanySSO: %v", err)
		http.Error(w, "Unable to update SSO settings", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PatchCompanySlug godoc
// @ID           companiesMeSlugPatch
// @Summary      Update tenant slug
// @Tags         companies
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  patchCompanySlugRequest  true  "New slug"
// @Success      200  {object} models.Company
// @Router       /companies/me/slug [patch]
func (h *CompanySSOHTTP) PatchCompanySlug(w http.ResponseWriter, r *http.Request) {
	c, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	var body patchCompanySlugRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if err := h.sso.ValidateAndSetSlug(c, body.Slug); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.companyRepo.Update(c); err != nil {
		if services.IsUniqueConstraintViolation(err) {
			http.Error(w, "slug already taken", http.StatusBadRequest)
			return
		}
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	updated, err := h.companyRepo.FindByID(c.ID)
	if err != nil {
		http.Error(w, "not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(updated)
}

// CreateOpaqueLoginLink godoc
// @ID           companiesMeLoginLinkPost
// @Summary      Create opaque login link
// @Tags         companies
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]string
// @Router       /companies/me/login-links [post]
func (h *CompanySSOHTTP) CreateOpaqueLoginLink(w http.ResponseWriter, r *http.Request) {
	c, ok := h.resolveCompany(w, r)
	if !ok {
		return
	}
	raw, err := h.sso.CreateOpaqueLoginLink(c.ID, 30*24*time.Hour)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	app := services.PublicAppURL()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"token":      raw,
		"exampleUrl": app + "/login?login_token=" + raw,
	})
}
