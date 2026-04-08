package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/services"
)

type AuthHandler struct {
	service services.AuthService
}

func NewAuthHandler(service services.AuthService) *AuthHandler {
	return &AuthHandler{service: service}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
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
	PlanCode    string `json:"planCode"` // optional, defaults to starter with trial
}

// Login godoc
// @Summary      User Login
// @Description  Authenticates a user and returns a JWT token
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body LoginRequest true "Login Credentials"
// @Success      200  {object}  LoginResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Router       /auth/login [post]
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	token, err := h.service.Login(req.Email, req.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if err := json.NewEncoder(w).Encode(LoginResponse{Token: token}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// GetMe godoc
// @Summary      Get current user
// @Description  Returns the currently authenticated user's information
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.User
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
	if err := json.NewEncoder(w).Encode(response); err != nil {
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
// @Summary      Sign Up
// @Description  Register a new user and organization with trial subscription
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request body SignupRequest true "Signup Information"
// @Success      201  {object}  LoginResponse "Created"
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

	token, err := h.service.Signup(req.Name, req.Email, req.Password, req.CompanyName, req.PlanCode)
	if err != nil {
		if errors.Is(err, services.ErrEmailAlreadyExists) {
			http.Error(w, "An account with this email already exists", http.StatusConflict)
			return
		}
		log.Printf("Signup: %v", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(LoginResponse{Token: token}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}
