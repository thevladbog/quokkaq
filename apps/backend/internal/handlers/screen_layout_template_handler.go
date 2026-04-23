package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// ScreenLayoutTemplateHandler serves tenant screen layout template CRUD.
type ScreenLayoutTemplateHandler struct {
	svc      *services.ScreenLayoutTemplateService
	userRepo repository.UserRepository
}

func NewScreenLayoutTemplateHandler(svc *services.ScreenLayoutTemplateService, userRepo repository.UserRepository) *ScreenLayoutTemplateHandler {
	return &ScreenLayoutTemplateHandler{svc: svc, userRepo: userRepo}
}

func (h *ScreenLayoutTemplateHandler) resolveCompanyID(w http.ResponseWriter, r *http.Request) (string, bool) {
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
			http.Error(w, "Not found", http.StatusNotFound)
			return "", false
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", false
	}
	return companyID, true
}

// ListScreenLayoutTemplates godoc
// @ID           ListScreenLayoutTemplates
// @Summary      List screen layout templates for the tenant
// @Tags         companies
// @Produce      json
// @Success      200 {array} models.ScreenLayoutTemplate
// @Failure      401 {string} string "Unauthorized"
// @Router       /companies/me/screen-layout-templates [get]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	list, err := h.svc.List(companyID)
	if err != nil {
		slog.Error("ListScreenLayoutTemplates", "err", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

// CreateScreenLayoutTemplateRequest is the body for POST /companies/me/screen-layout-templates.
type CreateScreenLayoutTemplateRequest struct {
	Name       string          `json:"name" example:"Lobby wide"`
	Definition json.RawMessage `json:"definition" swaggertype:"object"`
}

// CreateScreenLayoutTemplate godoc
// @ID           CreateScreenLayoutTemplate
// @Summary      Create a screen layout template
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        body body CreateScreenLayoutTemplateRequest true "Template (name + JSON definition matching ScreenTemplate)"
// @Success      201 {object} models.ScreenLayoutTemplate
// @Failure      400 {string} string "Bad request"
// @Failure      403 {string} string "Forbidden"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates [post]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req CreateScreenLayoutTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	row, err := h.svc.Create(companyID, req.Name, req.Definition)
	if err != nil {
		if errors.Is(err, services.ErrScreenLayoutTemplatePlanDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrScreenLayoutTemplateInvalidDefinition) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "name required") {
			http.Error(w, "name required", http.StatusBadRequest)
			return
		}
		slog.Error("CreateScreenLayoutTemplate", "err", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(row)
}

// UpdateScreenLayoutTemplateRequest is the body for PUT /companies/me/screen-layout-templates/{templateId}.
type UpdateScreenLayoutTemplateRequest struct {
	Name       string          `json:"name" example:"Lobby wide"`
	Definition json.RawMessage `json:"definition" swaggertype:"object"`
}

// UpdateScreenLayoutTemplate godoc
// @ID           UpdateScreenLayoutTemplate
// @Summary      Update a screen layout template
// @Tags         companies
// @Accept       json
// @Produce      json
// @Param        templateId path string true "Template ID"
// @Param        body body UpdateScreenLayoutTemplateRequest true "Template"
// @Success      200 {object} models.ScreenLayoutTemplate
// @Failure      400 {string} string "Bad request"
// @Failure      404 {string} string "Not found"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates/{templateId} [put]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "templateId")
	var req UpdateScreenLayoutTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	row, err := h.svc.Update(companyID, id, req.Name, req.Definition)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrScreenLayoutTemplatePlanDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if errors.Is(err, services.ErrScreenLayoutTemplateInvalidDefinition) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "name required") {
			http.Error(w, "name required", http.StatusBadRequest)
			return
		}
		slog.Error("UpdateScreenLayoutTemplate", "err", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(row)
}

// DeleteScreenLayoutTemplate godoc
// @ID           DeleteScreenLayoutTemplate
// @Summary      Delete a screen layout template
// @Tags         companies
// @Param        templateId path string true "Template ID"
// @Success      204
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not found"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates/{templateId} [delete]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "templateId")
	if err := h.svc.Delete(companyID, id); err != nil {
		if errors.Is(err, services.ErrScreenLayoutTemplatePlanDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		slog.Error("DeleteScreenLayoutTemplate", "err", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
