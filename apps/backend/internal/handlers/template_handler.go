package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	authmiddleware "quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type TemplateHandler struct {
	service  services.TemplateService
	userRepo repository.UserRepository
}

func NewTemplateHandler(service services.TemplateService, userRepo repository.UserRepository) *TemplateHandler {
	return &TemplateHandler{service: service, userRepo: userRepo}
}

func (h *TemplateHandler) resolveViewerCompany(w http.ResponseWriter, r *http.Request) (viewerID, companyID string, ok bool) {
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

// CreateTemplate godoc
// @ID           CreateTemplate
// @Summary      Create a new template
// @Description  Creates a new message template for the resolved tenant company (JWT admin + X-Company-Id when applicable).
// @Tags         templates
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        template body models.MessageTemplate true "Template Data"
// @Success      201  {object}  models.MessageTemplate
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /templates [post]
func (h *TemplateHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	var template models.MessageTemplate
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateTemplate(companyID, &template); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, template)
}

// GetAllTemplates godoc
// @ID           ListTemplates
// @Summary      Get all templates
// @Description  Lists message templates for the resolved tenant company only.
// @Tags         templates
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200    {array}   models.MessageTemplate
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /templates [get]
func (h *TemplateHandler) GetAllTemplates(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	templates, err := h.service.GetAllTemplates(companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, templates)
}

// GetTemplateByID godoc
// @ID           GetTemplateByID
// @Summary      Get a template by ID
// @Description  Retrieves a template by ID within the resolved tenant company.
// @Tags         templates
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        id   path      string  true  "Template ID"
// @Success      200  {object}  models.MessageTemplate
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Template not found"
// @Router       /templates/{id} [get]
func (h *TemplateHandler) GetTemplateByID(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	template, err := h.service.GetTemplateByID(id, companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Template not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, template)
}

// UpdateTemplate godoc
// @ID           UpdateTemplateByID
// @Summary      Update a template
// @Description  Updates an existing template within the resolved tenant company.
// @Tags         templates
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        id      path      string          true  "Template ID"
// @Param        template body      models.MessageTemplate  true  "Template Data"
// @Success      200     {object}  models.MessageTemplate
// @Failure      400     {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404     {string}  string "Template not found"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /templates/{id} [put]
func (h *TemplateHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var template models.MessageTemplate
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	template.ID = id

	if err := h.service.UpdateTemplate(companyID, &template); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Template not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, template)
}

// DeleteTemplate godoc
// @ID           DeleteTemplateByID
// @Summary      Delete a template
// @Description  Deletes a template by its ID within the resolved tenant company.
// @Tags         templates
// @Security     BearerAuth
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Param        id   path      string  true  "Template ID"
// @Success      204  "No Content"
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      404  {string}  string "Template not found"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /templates/{id} [delete]
func (h *TemplateHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveViewerCompany(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteTemplate(id, companyID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Template not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
