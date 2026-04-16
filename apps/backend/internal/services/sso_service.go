package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/ssocrypto"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/sso/redisstore"
	"quokkaq-go-backend/pkg/database"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

// OAuthStatePayload is stored in Redis for the duration of the OIDC redirect chain.
type OAuthStatePayload struct {
	CompanyID    string `json:"companyId"`
	CodeVerifier string `json:"codeVerifier"`
	Nonce        string `json:"nonce"`
	IssuerURL    string `json:"issuerUrl"`
	// UILocale is the Next.js [locale] segment the user had when starting SSO (e.g. "ru"); optional.
	UILocale string `json:"uiLocale,omitempty"`
}

// TenantHintResponse is returned by POST /auth/login/tenant-hint (anti-enumeration shape).
type TenantHintResponse struct {
	Next         string `json:"next"` // sso | password | choose_slug
	TenantSlug   string `json:"tenantSlug,omitempty"`
	DisplayName  string `json:"displayName,omitempty"`
	SsoAvailable bool   `json:"ssoAvailable"`
}

// PublicTenantResponse is returned by GET /public/tenants/{slug}.
type PublicTenantResponse struct {
	Slug         string `json:"slug"`
	DisplayName  string `json:"displayName"`
	SsoAvailable bool   `json:"ssoAvailable"`
}

// SSOService OIDC + tenant resolution.
type SSOService struct {
	companyRepo repository.CompanyRepository
	userRepo    repository.UserRepository
	ssoRepo     repository.SSORepository
	authSvc     AuthService
}

func NewSSOService(
	companyRepo repository.CompanyRepository,
	userRepo repository.UserRepository,
	ssoRepo repository.SSORepository,
	authSvc AuthService,
) *SSOService {
	return &SSOService{
		companyRepo: companyRepo,
		userRepo:    userRepo,
		ssoRepo:     ssoRepo,
		authSvc:     authSvc,
	}
}

// apiPublicURL is the browser-reachable origin of the Go API (OIDC redirect_uri, SAML ACS/entity).
// Do not fall back to APP_BASE_URL: in local dev it is usually the Next app (e.g. :3000), which would
// break SSO redirect registration against the IdP (must match the server that serves /auth/sso/callback).
func apiPublicURL() string {
	u := strings.TrimSpace(os.Getenv("API_PUBLIC_URL"))
	if u == "" {
		u = "http://localhost:3001"
	}
	return strings.TrimRight(u, "/")
}

func publicAppURL() string {
	u := strings.TrimSpace(os.Getenv("PUBLIC_APP_URL"))
	if u == "" {
		u = strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	}
	if u == "" {
		u = "http://localhost:3000"
	}
	return strings.TrimRight(u, "/")
}

// TenantHint resolves email domain to tenant / next step.
func (s *SSOService) TenantHint(email string) TenantHintResponse {
	email = strings.TrimSpace(strings.ToLower(email))
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 {
		return TenantHintResponse{Next: "choose_slug", SsoAvailable: false}
	}
	domain := email[at+1:]
	comps, conns, err := s.ssoRepo.FindCompaniesByEmailDomain(domain)
	if err != nil || len(comps) == 0 {
		return TenantHintResponse{Next: "choose_slug", SsoAvailable: false}
	}
	if len(comps) > 1 {
		return TenantHintResponse{Next: "choose_slug", SsoAvailable: false}
	}
	c := comps[0]
	conn := conns[0]
	var sso bool
	if strings.EqualFold(strings.TrimSpace(conn.SSOProtocol), "saml") {
		sso = conn.Enabled && strings.TrimSpace(conn.SAMLIDPMetadataURL) != ""
	} else {
		sso = conn.Enabled && strings.TrimSpace(conn.IssuerURL) != "" && strings.TrimSpace(conn.ClientID) != ""
		if sso {
			secret, _ := ssocrypto.DecryptAES256GCM(conn.ClientSecretEncrypted)
			sso = len(secret) > 0
		}
	}
	if sso {
		return TenantHintResponse{
			Next:         "sso",
			TenantSlug:   c.Slug,
			DisplayName:  c.Name,
			SsoAvailable: true,
		}
	}
	return TenantHintResponse{
		Next:         "password",
		TenantSlug:   c.Slug,
		DisplayName:  c.Name,
		SsoAvailable: false,
	}
}

// PublicTenantBySlug returns minimal metadata for login UI.
func (s *SSOService) PublicTenantBySlug(slug string) (*PublicTenantResponse, error) {
	slug = tenantslug.Normalize(slug)
	if err := tenantslug.Validate(slug); err != nil {
		return nil, err
	}
	c, err := s.companyRepo.FindBySlug(slug)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	if c.StrictPublicTenantResolve {
		return nil, gorm.ErrRecordNotFound
	}
	conn, err := s.ssoRepo.GetConnectionByCompanyID(c.ID)
	sso := false
	if err == nil && conn.Enabled {
		if strings.EqualFold(strings.TrimSpace(conn.SSOProtocol), "saml") {
			sso = strings.TrimSpace(conn.SAMLIDPMetadataURL) != ""
		} else {
			sso = strings.TrimSpace(conn.IssuerURL) != "" && strings.TrimSpace(conn.ClientID) != ""
			if sso {
				sec, decErr := ssocrypto.DecryptAES256GCM(conn.ClientSecretEncrypted)
				sso = decErr == nil && len(sec) > 0
			}
		}
	}
	return &PublicTenantResponse{
		Slug:         c.Slug,
		DisplayName:  c.Name,
		SsoAvailable: sso,
	}, nil
}

// LoginContextByOpaqueToken resolves tenant context for strict mode links.
func (s *SSOService) LoginContextByOpaqueToken(raw string) (*PublicTenantResponse, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty token")
	}
	sum := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(sum[:])
	link, err := s.ssoRepo.FindLoginLinkByHash(hash)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	c, err := s.companyRepo.FindByID(link.CompanyID)
	if err != nil {
		return nil, err
	}
	conn, err := s.ssoRepo.GetConnectionByCompanyID(c.ID)
	sso := false
	if err == nil && conn.Enabled {
		if strings.EqualFold(strings.TrimSpace(conn.SSOProtocol), "saml") {
			sso = strings.TrimSpace(conn.SAMLIDPMetadataURL) != ""
		} else {
			sso = strings.TrimSpace(conn.IssuerURL) != "" && strings.TrimSpace(conn.ClientID) != ""
			if sso {
				sec, decErr := ssocrypto.DecryptAES256GCM(conn.ClientSecretEncrypted)
				sso = decErr == nil && len(sec) > 0
			}
		}
	}
	return &PublicTenantResponse{
		Slug:         c.Slug,
		DisplayName:  c.Name,
		SsoAvailable: sso,
	}, nil
}

// BeginAuthorize redirects to IdP (browser).
func (s *SSOService) BeginAuthorize(ctx context.Context, w http.ResponseWriter, tenantSlug, uiLocale string) error {
	slug := tenantslug.Normalize(strings.TrimSpace(tenantSlug))
	if err := tenantslug.Validate(slug); err != nil {
		http.Error(w, "invalid tenant", http.StatusBadRequest)
		return err
	}
	c, err := s.companyRepo.FindBySlug(slug)
	if err != nil {
		http.Error(w, "tenant not found", http.StatusNotFound)
		return err
	}
	conn, err := s.ssoRepo.GetConnectionByCompanyID(c.ID)
	if err != nil {
		http.Error(w, "SSO not configured", http.StatusBadRequest)
		return err
	}
	if !conn.Enabled {
		http.Error(w, "SSO not configured", http.StatusBadRequest)
		return errors.New("SSO not configured")
	}
	secret, err := ssocrypto.DecryptAES256GCM(conn.ClientSecretEncrypted)
	if err != nil || len(secret) == 0 {
		http.Error(w, "SSO not configured", http.StatusBadRequest)
		if err != nil {
			return fmt.Errorf("SSO client secret: %w", err)
		}
		return errors.New("SSO not configured")
	}

	provider, err := oidc.NewProvider(ctx, strings.TrimSpace(conn.IssuerURL))
	if err != nil {
		log.Printf("oidc NewProvider: %v", err)
		http.Error(w, "SSO configuration error", http.StatusInternalServerError)
		return err
	}

	oauth2Config := oauth2.Config{
		ClientID:     conn.ClientID,
		ClientSecret: string(secret),
		RedirectURL:  apiPublicURL() + "/auth/sso/callback",
		Endpoint:     provider.Endpoint(),
		Scopes:       splitScopes(conn.Scopes),
	}

	state := randomHex(24)
	verifier := oauth2.GenerateVerifier()
	nonce := randomHex(16)

	payload := OAuthStatePayload{
		CompanyID:    c.ID,
		CodeVerifier: verifier,
		Nonce:        nonce,
		IssuerURL:    strings.TrimSpace(conn.IssuerURL),
		UILocale:     normalizeSSOUILocale(uiLocale),
	}
	rdb := redisstore.Client()
	if rdb == nil {
		http.Error(w, "SSO store unavailable", http.StatusServiceUnavailable)
		return errors.New("redis")
	}
	if err := redisstore.SetJSON(ctx, redisstore.KeyOAuthState(state), payload, 15*time.Minute); err != nil {
		log.Printf("redis set oauth state: %v", err)
		http.Error(w, "SSO store error", http.StatusServiceUnavailable)
		return err
	}

	opts := []oauth2.AuthCodeOption{
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(verifier),
	}
	url := oauth2Config.AuthCodeURL(state, opts...)
	w.Header().Set("Location", url)
	w.WriteHeader(http.StatusFound)
	return nil
}

func splitScopes(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return []string{oidc.ScopeOpenID, "email", "profile"}
	}
	return strings.Fields(s)
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return uuid.New().String()
	}
	return hex.EncodeToString(b)
}

// Stable SSO policy / resolve errors (map to login?sso_error=… query codes; no PII).
var (
	ErrSSOEmailRequired   = errors.New("sso: email required")
	ErrSSONoCompanyAccess = errors.New("sso: no company access")
	ErrSSONotProvisioned  = errors.New("sso: not provisioned")
)

func ssoErrorQueryCode(err error) string {
	switch {
	case errors.Is(err, ErrSSOEmailRequired):
		return "email_required"
	case errors.Is(err, ErrSSONoCompanyAccess):
		return "no_tenant_access"
	case errors.Is(err, ErrSSONotProvisioned):
		return "not_provisioned"
	default:
		return "denied"
	}
}

var ssoAllowedFrontendLocales = map[string]struct{}{
	"en": {}, "ru": {},
}

func normalizeSSOUILocale(s string) string {
	l := strings.ToLower(strings.TrimSpace(s))
	if _, ok := ssoAllowedFrontendLocales[l]; ok {
		return l
	}
	return ""
}

func effectiveLoginRedirectLocale(uiLocaleFromFlow string) string {
	if v := normalizeSSOUILocale(uiLocaleFromFlow); v != "" {
		return v
	}
	v := strings.TrimSpace(firstAllowedFrontendLocale())
	if v != "" {
		return v
	}
	return "en"
}

func loginPageSSOErrorURL(code, uiLocaleFromFlow string) string {
	locale := effectiveLoginRedirectLocale(uiLocaleFromFlow)
	base := strings.TrimRight(publicAppURL(), "/")
	q := url.Values{}
	q.Set("sso_error", code)
	return base + "/" + locale + "/login?" + q.Encode()
}

func loginSSOCallbackSuccessURL(finishCode, uiLocaleFromFlow string) string {
	loc := effectiveLoginRedirectLocale(uiLocaleFromFlow)
	base := strings.TrimRight(publicAppURL(), "/")
	return base + "/" + loc + "/login/sso/callback?code=" + finishCode
}

func (s *SSOService) redirectLoginSSOError(ctx context.Context, w http.ResponseWriter, r *http.Request, companyID *string, queryCode, auditDetail, uiLocaleFromFlow string) {
	s.persistSSOAudit(ctx, companyID, nil, false, auditDetail)
	http.Redirect(w, r, loginPageSSOErrorURL(queryCode, uiLocaleFromFlow), http.StatusFound)
}

// HandleCallback completes OIDC and redirects to the SPA with a one-time code.
func (s *SSOService) HandleCallback(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	code := q.Get("code")
	state := q.Get("state")
	if code == "" || state == "" {
		http.Error(w, "missing code or state", http.StatusBadRequest)
		return
	}
	var payload OAuthStatePayload
	if err := redisstore.GetJSON(ctx, redisstore.KeyOAuthState(state), &payload); err != nil {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}
	_ = redisstore.Del(ctx, redisstore.KeyOAuthState(state))

	conn, err := s.ssoRepo.GetConnectionByCompanyID(payload.CompanyID)
	if err != nil {
		http.Error(w, "SSO not found", http.StatusBadRequest)
		return
	}
	secret, err := ssocrypto.DecryptAES256GCM(conn.ClientSecretEncrypted)
	if err != nil {
		http.Error(w, "SSO error", http.StatusInternalServerError)
		return
	}

	provider, err := oidc.NewProvider(ctx, payload.IssuerURL)
	if err != nil {
		http.Error(w, "SSO error", http.StatusInternalServerError)
		return
	}
	oauth2Config := oauth2.Config{
		ClientID:     conn.ClientID,
		ClientSecret: string(secret),
		RedirectURL:  apiPublicURL() + "/auth/sso/callback",
		Endpoint:     provider.Endpoint(),
		Scopes:       splitScopes(conn.Scopes),
	}

	tok, err := oauth2Config.Exchange(ctx, code, oauth2.VerifierOption(payload.CodeVerifier))
	if err != nil {
		log.Printf("oauth2 exchange: %v", err)
		http.Error(w, "token exchange failed", http.StatusBadRequest)
		return
	}
	rawIDToken, ok := tok.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		http.Error(w, "missing id_token", http.StatusBadRequest)
		return
	}

	oidcConfig := &oidc.Config{ClientID: conn.ClientID}
	verifier := provider.Verifier(oidcConfig)
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		log.Printf("id token verify: %v", err)
		http.Error(w, "invalid id_token", http.StatusBadRequest)
		return
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified *bool  `json:"email_verified"`
		Name          string `json:"name"`
		Nonce         string `json:"nonce"`
	}
	if err := idToken.Claims(&claims); err != nil {
		http.Error(w, "invalid claims", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(payload.Nonce) != "" {
		if strings.TrimSpace(claims.Nonce) == "" {
			http.Error(w, "missing nonce in id_token", http.StatusBadRequest)
			return
		}
		if claims.Nonce != payload.Nonce {
			http.Error(w, "nonce mismatch", http.StatusBadRequest)
			return
		}
	}
	emailVerified := claims.EmailVerified != nil && *claims.EmailVerified
	if !emailVerified && claims.Email != "" {
		// Some IdPs omit email_verified; treat as unverified.
		cid := payload.CompanyID
		s.redirectLoginSSOError(ctx, w, r, &cid, "email_unverified", "oidc_email_unverified", payload.UILocale)
		return
	}

	company, err := s.companyRepo.FindByID(payload.CompanyID)
	if err != nil {
		http.Error(w, "tenant error", http.StatusInternalServerError)
		return
	}

	user, err := s.resolveSSOUser(ctx, company, conn, idToken.Issuer, idToken.Subject, claims.Email, claims.Name, emailVerified)
	if err != nil {
		log.Printf("sso resolve user: %v", err)
		code := ssoErrorQueryCode(err)
		cid := payload.CompanyID
		s.redirectLoginSSOError(ctx, w, r, &cid, code, "oidc_callback_denied:"+code, payload.UILocale)
		return
	}

	finish := randomHex(16)
	if err := redisstore.SetJSON(ctx, redisstore.KeyExchange(finish), map[string]string{
		"userId": user.ID,
	}, 3*time.Minute); err != nil {
		http.Error(w, "session error", http.StatusServiceUnavailable)
		return
	}

	loc := loginSSOCallbackSuccessURL(finish, payload.UILocale)
	cid := payload.CompanyID
	uid := user.ID
	s.persistSSOAudit(ctx, &cid, &uid, true, "oidc_callback_ok")
	http.Redirect(w, r, loc, http.StatusFound)
}

func firstAllowedFrontendLocale() string {
	// Optional: NEXT_PUBLIC_DEFAULT_LOCALE
	if v := strings.TrimSpace(os.Getenv("LOGIN_REDIRECT_LOCALE")); v != "" {
		return v
	}
	return "en"
}

func (s *SSOService) resolveSSOUser(ctx context.Context, company *models.Company, conn *models.CompanySSOConnection, iss, sub, email, name string, emailVerified bool) (*models.User, error) {
	if ext, err := s.ssoRepo.FindExternalIdentity(iss, sub); err == nil && ext.CompanyID == company.ID {
		u, err := s.userRepo.FindByID(ext.UserID)
		if err != nil {
			return nil, err
		}
		ok, _ := s.userRepo.HasCompanyAccess(u.ID, company.ID)
		if ok {
			return u, nil
		}
		// Identity row exists but user lost access, or stale link — fall through.
	}
	if email == "" || !emailVerified {
		return nil, ErrSSOEmailRequired
	}
	user, err := s.userRepo.FindByEmail(strings.TrimSpace(email))
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err == nil && user != nil {
		ok, _ := s.userRepo.HasCompanyAccess(user.ID, company.ID)
		if !ok {
			return nil, ErrSSONoCompanyAccess
		}
		_ = s.ssoRepo.CreateExternalIdentity(&models.UserExternalIdentity{
			UserID:    user.ID,
			CompanyID: company.ID,
			Issuer:    iss,
			Subject:   sub,
		})
		return user, nil
	}
	if !company.SsoJitProvisioning {
		return nil, ErrSSONotProvisioned
	}
	// JIT: create user and assign first unit + staff role
	var unit models.Unit
	if err := database.DB.Where("company_id = ?", company.ID).Order("created_at ASC").First(&unit).Error; err != nil {
		return nil, fmt.Errorf("no unit for jit: %w", err)
	}
	emailPtr := strings.TrimSpace(email)
	newUser := &models.User{
		Name:     strings.TrimSpace(name),
		Email:    &emailPtr,
		Password: nil,
		Type:     "staff",
		IsActive: true,
	}
	if newUser.Name == "" {
		newUser.Name = emailPtr
	}
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		staffRole, err := s.userRepo.EnsureRoleExistsTx(tx, "staff")
		if err != nil {
			return err
		}
		if err := s.userRepo.CreateTx(tx, newUser); err != nil {
			return err
		}
		if err := s.userRepo.AssignRoleTx(tx, newUser.ID, staffRole.ID); err != nil {
			return err
		}
		uu := models.UserUnit{
			UserID:      newUser.ID,
			UnitID:      unit.ID,
			Permissions: nil,
		}
		if err := tx.Create(&uu).Error; err != nil {
			return err
		}
		ext := &models.UserExternalIdentity{
			UserID:    newUser.ID,
			CompanyID: company.ID,
			Issuer:    iss,
			Subject:   sub,
		}
		return tx.Create(ext).Error
	})
	if err != nil {
		return nil, err
	}
	return s.userRepo.FindByID(newUser.ID)
}

// ExchangeFinishCode returns JWT pair for a one-time code from the OIDC callback redirect.
func (s *SSOService) ExchangeFinishCode(ctx context.Context, code string) (*TokenPair, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, errors.New("missing code")
	}
	var m map[string]string
	if err := redisstore.GetJSON(ctx, redisstore.KeyExchange(code), &m); err != nil {
		return nil, err
	}
	_ = redisstore.Del(ctx, redisstore.KeyExchange(code))
	uid := m["userId"]
	if uid == "" {
		return nil, errors.New("invalid exchange")
	}
	pair, err := s.authSvc.IssueTokenPairForUserID(uid)
	if err != nil {
		return nil, err
	}
	uidCopy := uid
	s.persistSSOAudit(ctx, nil, &uidCopy, true, "sso_exchange")
	return pair, nil
}

// CreateOpaqueLoginLink creates a random token and stores hashed form; returns raw token for URL.
func (s *SSOService) CreateOpaqueLoginLink(companyID string, ttl time.Duration) (raw string, err error) {
	raw = randomHex(24)
	sum := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(sum[:])
	link := &models.TenantLoginLink{
		CompanyID: companyID,
		TokenHash: hash,
		ExpiresAt: time.Now().Add(ttl),
	}
	if err := s.ssoRepo.CreateLoginLink(link); err != nil {
		return "", err
	}
	return raw, nil
}

const ssoAuditDetailMax = 512

func truncateSSOAuditDetail(s string) string {
	if len(s) <= ssoAuditDetailMax {
		return s
	}
	return s[:ssoAuditDetailMax]
}

func (s *SSOService) persistSSOAudit(ctx context.Context, companyID *string, userID *string, success bool, detail string) {
	d := truncateSSOAuditDetail(detail)
	e := &models.SSOAuditEvent{
		CompanyID: companyID,
		UserID:    userID,
		Success:   success,
		Detail:    d,
	}
	if err := s.ssoRepo.InsertSSOAudit(ctx, e); err != nil {
		log.Printf("sso audit insert: %v", err)
	}
}

// PatchCompanySSO updates OIDC settings for a company (tenant admin).
func (s *SSOService) PatchCompanySSO(company *models.Company, body CompanySSOPatch) error {
	conn, err := s.ssoRepo.GetConnectionByCompanyID(company.ID)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		conn = &models.CompanySSOConnection{CompanyID: company.ID}
	}
	if body.Enabled != nil {
		conn.Enabled = *body.Enabled
	}
	if body.SSOProtocol != nil {
		p := strings.ToLower(strings.TrimSpace(*body.SSOProtocol))
		if p == "oidc" || p == "saml" {
			conn.SSOProtocol = p
		}
	}
	if body.SAMLIDPMetadataURL != nil {
		conn.SAMLIDPMetadataURL = strings.TrimSpace(*body.SAMLIDPMetadataURL)
	}
	if body.IssuerURL != nil {
		conn.IssuerURL = strings.TrimSpace(*body.IssuerURL)
	}
	if body.ClientID != nil {
		conn.ClientID = strings.TrimSpace(*body.ClientID)
	}
	if body.ClientSecret != nil && strings.TrimSpace(*body.ClientSecret) != "" {
		enc, err := ssocrypto.EncryptAES256GCM([]byte(strings.TrimSpace(*body.ClientSecret)))
		if err != nil {
			return err
		}
		conn.ClientSecretEncrypted = enc
	}
	if body.EmailDomains != nil {
		conn.EmailDomains = models.StringArray(*body.EmailDomains)
	}
	if body.Scopes != nil && strings.TrimSpace(*body.Scopes) != "" {
		conn.Scopes = strings.TrimSpace(*body.Scopes)
	}
	return s.ssoRepo.UpsertConnection(conn)
}

// CompanySSOPatch is JSON for PATCH /companies/me/sso.
type CompanySSOPatch struct {
	Enabled            *bool     `json:"enabled"`
	SSOProtocol        *string   `json:"ssoProtocol"` // "oidc" | "saml"
	SAMLIDPMetadataURL *string   `json:"samlIdpMetadataUrl"`
	IssuerURL          *string   `json:"issuerUrl"`
	ClientID           *string   `json:"clientId"`
	ClientSecret       *string   `json:"clientSecret"` // plaintext once; stored encrypted
	EmailDomains       *[]string `json:"emailDomains"`
	Scopes             *string   `json:"scopes"`
}

// CompanySSOGetResponse masks secrets for GET.
type CompanySSOGetResponse struct {
	Enabled            bool     `json:"enabled"`
	SSOProtocol        string   `json:"ssoProtocol"`
	SAMLIDPMetadataURL string   `json:"samlIdpMetadataUrl,omitempty"`
	IssuerURL          string   `json:"issuerUrl"`
	ClientID           string   `json:"clientId"`
	ClientSecretSet    bool     `json:"clientSecretSet"`
	EmailDomains       []string `json:"emailDomains"`
	Scopes             string   `json:"scopes"`
}

// GetCompanySSO returns masked SSO config.
func (s *SSOService) GetCompanySSO(companyID string) (*CompanySSOGetResponse, error) {
	conn, err := s.ssoRepo.GetConnectionByCompanyID(companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &CompanySSOGetResponse{SSOProtocol: "oidc", Scopes: "openid email profile"}, nil
		}
		return nil, err
	}
	proto := conn.SSOProtocol
	if proto == "" {
		proto = "oidc"
	}
	secOK := strings.TrimSpace(conn.ClientSecretEncrypted) != ""
	if secOK {
		if _, err := ssocrypto.DecryptAES256GCM(conn.ClientSecretEncrypted); err != nil {
			secOK = false
		}
	}
	domains := []string(conn.EmailDomains)
	return &CompanySSOGetResponse{
		Enabled:            conn.Enabled,
		SSOProtocol:        proto,
		SAMLIDPMetadataURL: conn.SAMLIDPMetadataURL,
		IssuerURL:          conn.IssuerURL,
		ClientID:           conn.ClientID,
		ClientSecretSet:    secOK,
		EmailDomains:       domains,
		Scopes:             conn.Scopes,
	}, nil
}

// PatchLoginPolicy updates strict flags (platform admin only).
func (s *SSOService) PatchLoginPolicy(company *models.Company, strict, opaque *bool, jit *bool) {
	if strict != nil {
		company.StrictPublicTenantResolve = *strict
	}
	if opaque != nil {
		company.OpaqueLoginLinksOnly = *opaque
	}
	if jit != nil {
		company.SsoJitProvisioning = *jit
	}
}

// ValidateAndSetSlug sets company slug if valid and unique.
func (s *SSOService) ValidateAndSetSlug(company *models.Company, slug string) error {
	n := tenantslug.Normalize(slug)
	if err := tenantslug.Validate(n); err != nil {
		return err
	}
	taken, err := s.companyRepo.IsSlugTakenByOther(n, company.ID)
	if err != nil {
		return err
	}
	if taken {
		return errors.New("slug already taken")
	}
	company.Slug = n
	return nil
}

// BackfillSlugIfEmpty generates slug from company name (used after signup).
func BackfillSlugFromName(name string) string {
	n := tenantslug.Normalize(name)
	if len(n) < tenantslug.MinLen {
		n = n + "-org"
	}
	if tenantslug.Validate(n) != nil {
		n = "tenant-" + strings.ReplaceAll(uuid.New().String(), "-", "")[:8]
	}
	return n
}
