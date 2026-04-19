package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type InvitationHandler struct {
	service  services.InvitationService
	userRepo repository.UserRepository
}

func NewInvitationHandler(service services.InvitationService, userRepo repository.UserRepository) *InvitationHandler {
	return &InvitationHandler{service: service, userRepo: userRepo}
}

func (h *InvitationHandler) resolveViewerCompany(w http.ResponseWriter, r *http.Request) (viewerID, companyID string, ok bool) {
	userID, authOk := authmiddleware.GetUserIDFromContext(r.Context())
	if !authOk || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", "", false
	}
	cid, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden", http.StatusForbidden)
		} else {
			http.Error(w, "Company context required", http.StatusBadRequest)
		}
		return "", "", false
	}
	return userID, cid, true
}

type CreateInvitationRequest struct {
	Email       string          `json:"email"`
	TemplateID  string          `json:"templateId"`
	TargetUnits json.RawMessage `json:"targetUnits" swaggertype:"object"`
	TargetRoles json.RawMessage `json:"targetRoles" swaggertype:"object"`
}

// CreateInvitation godoc
// @Summary      Create a new invitation
// @Description  Creates a new invitation for the resolved tenant company. Organization for the invitee is determined by the invitation token on acceptance, not by email alone.
// @Tags         invitations
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        request body CreateInvitationRequest true "Invitation Request"
// @Success      201  {object}  models.Invitation
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations [post]
func (h *InvitationHandler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	var req CreateInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		http.Error(w, "Email is required", http.StatusBadRequest)
		return
	}

	invitation, err := h.service.CreateInvitation(companyID, req.Email, req.TargetUnits, req.TargetRoles, req.TemplateID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, invitation)
}

// GetAllInvitations godoc
// @Summary      Get all invitations
// @Description  Lists invitations for the resolved tenant company only.
// @Tags         invitations
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200    {array}   models.Invitation
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /invitations [get]
func (h *InvitationHandler) GetAllInvitations(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	invitations, err := h.service.GetAllInvitations(companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, invitations)
}

// DeleteInvitation godoc
// @Summary      Delete an invitation
// @Description  Deletes an invitation by its ID within the resolved tenant company.
// @Tags         invitations
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        id   path      string  true  "Invitation ID"
// @Success      204  {object}  nil
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations/{id} [delete]
func (h *InvitationHandler) DeleteInvitation(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteInvitation(id, companyID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ResendInvitation godoc
// @Summary      Resend an invitation
// @Description  Resends an active invitation by its ID within the resolved tenant company.
// @Tags         invitations
// @Accept       json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        id   path      string  true  "Invitation ID"
// @Success      200  {object}  nil
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations/{id}/resend [patch]
func (h *InvitationHandler) ResendInvitation(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.service.ResendInvitation(id, companyID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

type RegisterUserRequest struct {
	Token    string `json:"token"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

// RegisterUser godoc
// @Summary      Register a new user via invitation
// @Description  Registers a new user using an invitation token
// @Tags         invitations
// @Accept       json
// @Produce      json
// @Param        request body RegisterUserRequest true "Register Request"
// @Success      200  {object}  models.User
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations/register [post]
func (h *InvitationHandler) RegisterUser(w http.ResponseWriter, r *http.Request) {
	var req RegisterUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Token == "" || req.Name == "" || req.Password == "" {
		http.Error(w, "Token, name and password are required", http.StatusBadRequest)
		return
	}

	user, err := h.service.RegisterUser(req.Token, req.Name, req.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	RespondJSON(w, user)
}

// GetInvitationByToken godoc
// @Summary      Get invitation by token
// @Description  Retrieves an invitation by its token
// @Tags         invitations
// @Param        token   path      string  true  "Invitation Token"
// @Success      200  {object}  models.Invitation
// @Failure      404  {string}  string "Not Found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations/token/{token} [get]
func (h *InvitationHandler) GetInvitationByToken(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	invitation, err := h.service.GetInvitationByToken(token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	RespondJSON(w, invitation)
}
