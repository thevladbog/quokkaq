package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/authcookie"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"
	"strings"

	"gorm.io/gorm"
)

type AuthHandler struct {
	service     services.AuthService
	userService services.UserService
	userRepo    repository.UserRepository
	tenantRBAC  repository.TenantRBACRepository
	leadIssues  *services.LeadIssueService
}

func NewAuthHandler(service services.AuthService, userService services.UserService, userRepo repository.UserRepository, tenantRBAC repository.TenantRBACRepository, leadIssues *services.LeadIssueService) *AuthHandler {
	return &AuthHandler{service: service, userService: userService, userRepo: userRepo, tenantRBAC: tenantRBAC, leadIssues: leadIssues}
}

// PatchMeRequest is the body for PATCH /auth/me (self-service profile photo only).
// Validation is performed in PatchMe (json.Decoder does not use Gin binding tags).
type PatchMeRequest struct {
	PhotoURL *string `json:"photoUrl"`
}

const maxProfilePhotoURLLen = 2048

func validateProfilePhotoURL(raw string) error {
	t := strings.TrimSpace(raw)
	if t == "" {
		return nil
	}
	if len(t) > maxProfilePhotoURLLen {
		return errors.New("photoUrl is too long")
	}
	u, err := url.Parse(t)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return errors.New("photoUrl must be a valid http or https URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("photoUrl must use http or https")
	}
	return nil
}

type LoginRequest struct {
	Email      string `json:"email" binding:"required"`
	Password   string `json:"password" binding:"required"`
	TenantSlug string `json:"tenantSlug,omitempty"`
}

// LoginSessionResponse is the JSON body for cookie-based login, signup, and SSO exchange.
// Refresh JWTs are issued only via HttpOnly Set-Cookie (see operation response headers).
type LoginSessionResponse struct {
	Token       string `json:"token"`       // same as accessToken (legacy clients)
	AccessToken string `json:"accessToken"` // legacy field name; same JWT as token
}

// RefreshResponse is the body of POST /auth/refresh.
// Refresh tokens are rotated via HttpOnly cookies only; the JSON body exposes the new access JWT.
type RefreshResponse struct {
	AccessToken string `json:"accessToken"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

type SignupRequest struct {
	Name        string `json:"name" binding:"required"`
	Email       string `json:"email" binding:"required"`
	Password    string `json:"password" binding:"required"`
	CompanyName string `json:"companyName" binding:"required"`
	PlanCode    string `json:"planCode"`    // optional, defaults to starter with trial
	CompanySlug string `json:"companySlug"` // optional; if empty, generated from company name
}

// Login godoc
// @ID           authLogin
// @Summary      User Login
// @Description  Authenticates a user; refresh JWT is set only via HttpOnly `Set-Cookie` (SessionCookie). JSON returns access JWT (`token` duplicates `accessToken` for legacy clients). Optional `tenantSlug` scopes login to a tenant the user can access; omit for default behavior.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body LoginRequest true "Login Credentials"
// @Success      200  {object}  LoginSessionResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /auth/login [post]
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		http.Error(w, "email and password are required", http.StatusBadRequest)
		return
	}

	pair, err := h.service.Login(req.Email, req.Password, strings.TrimSpace(req.TenantSlug))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	authcookie.WriteSessionCookies(w, r, pair)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(LoginSessionResponse{
		Token:       pair.AccessToken,
		AccessToken: pair.AccessToken,
	}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// Refresh godoc
// @ID           authRefresh
// @Summary      Refresh tokens
// @Description  Exchanges a valid refresh JWT for a new access JWT. The refresh token is read from HttpOnly session cookies when present; otherwise send `Authorization: Bearer <refresh>`. Rotated refresh tokens are returned only via `Set-Cookie`, not in the JSON body.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  RefreshResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /auth/refresh [post]
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	refresh := authcookie.RefreshTokenFromRequest(r)
	if refresh == "" {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}
		refresh = parts[1]
	}

	pair, err := h.service.Refresh(refresh)
	if err != nil {
		if errors.Is(err, services.ErrUserInactive) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		http.Error(w, "Invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	authcookie.WriteSessionCookies(w, r, pair)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(RefreshResponse{
		AccessToken: pair.AccessToken,
	}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// Logout godoc
// @ID           authLogout
// @Summary      Log out (clear session cookies)
// @Description  Clears HttpOnly session cookies set by login and refresh. Does not require a JSON body.
// @Tags         auth
// @Success      204
// @Router       /auth/logout [post]
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	authcookie.ClearSessionCookies(w, r)
	w.WriteHeader(http.StatusNoContent)
}

// GetMe godoc
// @ID           authGetMe
// @Summary      Get current user
// @Description  Returns the currently authenticated user's information
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  UserResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "User not found"
// @Router       /auth/me [get]
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.service.GetMe(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Map to DTO for proper frontend format
	response := MapUserToResponse(user)
	h.attachTenantRolesToResponse(r, userID, response)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// PatchMe godoc
// @ID           authPatchMe
// @Summary      Update current user profile (photo only)
// @Description  Authenticated users may update only their profile photo URL. Send `photoUrl` as a string (use empty string to clear). Omitted `photoUrl` is rejected.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body PatchMeRequest true "photoUrl only"
// @Success      200  {object}  UserResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "User not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /auth/me [patch]
// @Security     BearerAuth
func (h *AuthHandler) PatchMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req PatchMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.PhotoURL == nil {
		http.Error(w, "photoUrl is required", http.StatusBadRequest)
		return
	}

	trimmed := strings.TrimSpace(*req.PhotoURL)
	if err := validateProfilePhotoURL(trimmed); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	photoForUpdate := trimmed
	input := &models.UpdateUserInput{
		PhotoURL: &photoForUpdate,
	}
	if err := h.userService.UpdateUser(userID, input); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrUpdateUserEmptyInput) || errors.Is(err, services.ErrUpdateUserNameEmpty) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		logger.ErrorfCtx(r.Context(), "PatchMe: UpdateUser error: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	user, err := h.service.GetMe(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.ErrorfCtx(r.Context(), "PatchMe: GetMe after update: user not found: %v", err)
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		logger.ErrorfCtx(r.Context(), "PatchMe: GetMe after update error: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	response := MapUserToResponse(user)
	h.attachTenantRolesToResponse(r, userID, response)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (h *AuthHandler) attachTenantRolesToResponse(r *http.Request, userID string, response *UserResponse) {
	if h.tenantRBAC == nil {
		return
	}
	cid, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		return
	}
	trByUser, err := h.tenantRBAC.MapTenantRolesByUserForCompany(cid, []string{userID})
	if err != nil {
		return
	}
	for _, tr := range trByUser[userID] {
		response.TenantRoles = append(response.TenantRoles, TenantRoleBriefResponse{
			ID: tr.ID, Name: tr.Name, Slug: tr.Slug,
		})
	}
}

// AccessibleCompanyItem is one row in GET /auth/accessible-companies.
type AccessibleCompanyItem struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	LegalName *string `json:"legalName,omitempty"`
	Inn       *string `json:"inn,omitempty"`
}

// AccessibleCompaniesResponse is the body of GET /auth/accessible-companies.
type AccessibleCompaniesResponse struct {
	Companies []AccessibleCompanyItem `json:"companies"`
}

// ListAccessibleCompanies godoc
// @ID           authAccessibleCompanies
// @Summary      List companies the current user may access
// @Description  Distinct tenants from unit assignments and company ownership. Optional query q searches name, legal name, INN, counterparty JSON.
// @Tags         auth
// @Produce      json
// @Param        q query string false "Search substring (case-insensitive)"
// @Security     BearerAuth
// @Success      200  {object}  AccessibleCompaniesResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /auth/accessible-companies [get]
func (h *AuthHandler) ListAccessibleCompanies(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query().Get("q")
	rows, err := h.userRepo.ListAccessibleCompanies(userID, q)
	if err != nil {
		logger.ErrorfCtx(r.Context(), "ListAccessibleCompanies: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	items := make([]AccessibleCompanyItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, AccessibleCompanyItem{
			ID:        row.ID,
			Name:      row.Name,
			LegalName: row.LegalName,
			Inn:       row.Inn,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(AccessibleCompaniesResponse{Companies: items}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// RequestPasswordReset godoc
// @Summary      Request Password Reset
// @Description  Sends a password reset link to the user's email
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body ForgotPasswordRequest true "Email Address"
// @Success      200  {string}  string "Reset link sent"
// @Failure      400  {string}  string "Bad Request"
// @Router       /auth/forgot-password [post]
func (h *AuthHandler) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Intentionally ignore error to avoid user enumeration
	_ = h.service.RequestPasswordReset(req.Email)

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"message": "If an account with that email exists, we sent you a reset link"}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// ResetPassword godoc
// @Summary      Reset Password
// @Description  Resets the user's password using a valid token
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body ResetPasswordRequest true "New Password and Token"
// @Success      200  {string}  string "Password reset successfully"
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Invalid or expired token"
// @Router       /auth/reset-password [post]
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Support token in query param or body. The plan said query param for page, but API usually takes it in body or query.
	// The implementation plan said: "Create "Reset Password" Page (handling token)" and "ResetPassword(token, newPassword string) error".
	// Let's assume the frontend extracts token from URL and sends it in JSON body.
	if req.Token == "" {
		req.Token = r.URL.Query().Get("token")
	}

	if err := h.service.ResetPassword(req.Token, req.NewPassword); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"message": "Password reset successfully"}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// Signup godoc
// @ID           authSignup
// @Summary      Sign Up
// @Description  Register a new user and organization with trial subscription
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body SignupRequest true "Signup Information"
// @Success      201  {object}  LoginSessionResponse "Created"
// @Failure      400  {string}  string "Bad Request"
// @Failure      409  {string}  string "Email already exists"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /auth/signup [post]
func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" || req.Email == "" || req.Password == "" || req.CompanyName == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	// Default to starter plan if not specified
	if req.PlanCode == "" {
		req.PlanCode = "starter"
	}

	var preferredSlug *string
	if s := strings.TrimSpace(req.CompanySlug); s != "" {
		preferredSlug = &s
	}
	pair, err := h.service.Signup(req.Name, req.Email, req.Password, req.CompanyName, req.PlanCode, preferredSlug)
	if err != nil {
		if errors.Is(err, services.ErrEmailAlreadyExists) {
			http.Error(w, "An account with this email already exists", http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrInvalidCompanySlug) {
			http.Error(w, "Invalid company slug", http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrCompanySlugTaken) {
			http.Error(w, "Company slug is already taken", http.StatusConflict)
			return
		}
		if errors.Is(err, services.ErrTenantRBACNotConfigured) {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		logger.ErrorfCtx(r.Context(), "Signup: %v", err)
		if h.leadIssues != nil {
			h.leadIssues.NotifySignupFailure(r.Context(), req.CompanyName, req.Email, req.PlanCode, err.Error())
		}
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	authcookie.WriteSessionCookies(w, r, pair)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(LoginSessionResponse{
		Token:       pair.AccessToken,
		AccessToken: pair.AccessToken,
	}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}
