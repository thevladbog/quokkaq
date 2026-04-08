package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type InvitationHandler struct {
	service services.InvitationService
}

func NewInvitationHandler(service services.InvitationService) *InvitationHandler {
	return &InvitationHandler{service: service}
}

type CreateInvitationRequest struct {
	Email       string          `json:"email"`
	TemplateID  string          `json:"templateId"`
	TargetUnits json.RawMessage `json:"targetUnits" swaggertype:"object"`
	TargetRoles json.RawMessage `json:"targetRoles" swaggertype:"object"`
}

// CreateInvitation godoc
// @Summary      Create a new invitation
// @Description  Creates a new invitation for a user with optional pre-assigned units and roles
// @Tags         invitations
// @Accept       json
// @Produce      json
// @Param        request body CreateInvitationRequest true "Invitation Request"
// @Success      201  {object}  models.Invitation
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations [post]
func (h *InvitationHandler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	var req CreateInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		http.Error(w, "Email is required", http.StatusBadRequest)
		return
	}

	invitation, err := h.service.CreateInvitation(req.Email, req.TargetUnits, req.TargetRoles, req.TemplateID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, invitation)
}

// GetAllInvitations godoc
// @Summary      Get all invitations
// @Description  Retrieves all invitations
// @Tags         invitations
// @Produce      json
// @Success      200    {array}   models.Invitation
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /invitations [get]
func (h *InvitationHandler) GetAllInvitations(w http.ResponseWriter, r *http.Request) {
	invitations, err := h.service.GetAllInvitations()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, invitations)
}

// DeleteInvitation godoc
// @Summary      Delete an invitation
// @Description  Deletes an invitation by its ID
// @Tags         invitations
// @Param        id   path      string  true  "Invitation ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations/{id} [delete]
func (h *InvitationHandler) DeleteInvitation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteInvitation(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ResendInvitation godoc
// @Summary      Resend an invitation
// @Description  Resends an active invitation by its ID
// @Tags         invitations
// @Accept       json
// @Param        id   path      string  true  "Invitation ID"
// @Success      200  {object}  nil
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /invitations/{id}/resend [patch]
func (h *InvitationHandler) ResendInvitation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.ResendInvitation(id); err != nil {
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
