package handlers

import (
	"encoding/json"
	"net/http"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type TemplateHandler struct {
	service services.TemplateService
}

func NewTemplateHandler(service services.TemplateService) *TemplateHandler {
	return &TemplateHandler{service: service}
}

// CreateTemplate godoc
// @Summary      Create a new template
// @Description  Creates a new message template
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        template body models.MessageTemplate true "Template Data"
// @Success      201  {object}  models.MessageTemplate
// @Failure      400  {string}  string "Bad Request"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /templates [post]
func (h *TemplateHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var template models.MessageTemplate
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateTemplate(&template); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	RespondJSON(w, template)
}

// GetAllTemplates godoc
// @Summary      Get all templates
// @Description  Retrieves all message templates
// @Tags         templates
// @Produce      json
// @Success      200    {array}   models.MessageTemplate
// @Failure      500    {string}  string "Internal Server Error"
// @Router       /templates [get]
func (h *TemplateHandler) GetAllTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := h.service.GetAllTemplates()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, templates)
}

// GetTemplateByID godoc
// @Summary      Get a template by ID
// @Description  Retrieves a specific template by its ID
// @Tags         templates
// @Produce      json
// @Param        id   path      string  true  "Template ID"
// @Success      200  {object}  models.MessageTemplate
// @Failure      404  {string}  string "Template not found"
// @Router       /templates/{id} [get]
func (h *TemplateHandler) GetTemplateByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	template, err := h.service.GetTemplateByID(id)
	if err != nil {
		http.Error(w, "Template not found", http.StatusNotFound)
		return
	}
	RespondJSON(w, template)
}

// UpdateTemplate godoc
// @Summary      Update a template
// @Description  Updates an existing template
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        id      path      string          true  "Template ID"
// @Param        template body      models.MessageTemplate  true  "Template Data"
// @Success      200     {object}  models.MessageTemplate
// @Failure      400     {string}  string "Bad Request"
// @Failure      500     {string}  string "Internal Server Error"
// @Router       /templates/{id} [put]
func (h *TemplateHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var template models.MessageTemplate
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	template.ID = id

	if err := h.service.UpdateTemplate(&template); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	RespondJSON(w, template)
}

// DeleteTemplate godoc
// @Summary      Delete a template
// @Description  Deletes a template by its ID
// @Tags         templates
// @Param        id   path      string  true  "Template ID"
// @Success      204  {object}  nil
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /templates/{id} [delete]
func (h *TemplateHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteTemplate(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
