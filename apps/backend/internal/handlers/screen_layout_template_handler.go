package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

const screenLayoutTemplateRequestMetadataAllowance = 16 << 10

func decodeScreenLayoutTemplateRequest(w http.ResponseWriter, r *http.Request, destination any) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, experience.MaxDefinitionBytes+screenLayoutTemplateRequestMetadataAllowance))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, destination)
}

func writeScreenLayoutTemplateDecodeError(w http.ResponseWriter, err error) {
	var maxBytesErr *http.MaxBytesError
	if errors.As(err, &maxBytesErr) {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	http.Error(w, "Invalid JSON", http.StatusBadRequest)
}

// ScreenLayoutTemplateHandler serves tenant screen layout template CRUD.
type ScreenLayoutTemplateHandler struct {
	svc      screenLayoutTemplateService
	userRepo repository.UserRepository
}

type screenLayoutTemplateService interface {
	List(companyID string) ([]models.ScreenLayoutTemplate, error)
	Create(companyID, name, surface string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error)
	Update(companyID, id, name string, definition json.RawMessage, surface *string) (*models.ScreenLayoutTemplate, error)
	Delete(companyID, id string) error
	Publish(ctx context.Context, companyID, templateID, publisherID string) (*models.ExperienceTemplateVersion, error)
	ListVersions(ctx context.Context, companyID, templateID string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error)
	Restore(ctx context.Context, companyID, templateID, sourceVersionID, publisherID string) (*models.ExperienceTemplateVersion, error)
}

func NewScreenLayoutTemplateHandler(svc screenLayoutTemplateService, userRepo repository.UserRepository) *ScreenLayoutTemplateHandler {
	return &ScreenLayoutTemplateHandler{svc: svc, userRepo: userRepo}
}

func (h *ScreenLayoutTemplateHandler) resolveActorAndCompany(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", "", false
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden: no access to selected organization", http.StatusForbidden)
			return "", "", false
		}
		if repository.IsNotFound(err) {
			http.Error(w, "Not found", http.StatusNotFound)
			return "", "", false
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return "", "", false
	}
	return userID, companyID, true
}

func (h *ScreenLayoutTemplateHandler) resolveCompanyID(w http.ResponseWriter, r *http.Request) (string, bool) {
	_, companyID, ok := h.resolveActorAndCompany(w, r)
	return companyID, ok
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
	Surface    string          `json:"surface,omitempty" enums:"ticket-station,queue-display,counter-display,visitor-mobile"`
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
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      413 {string} string "Request body too large"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates [post]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.resolveCompanyID(w, r)
	if !ok {
		return
	}
	var req CreateScreenLayoutTemplateRequest
	if err := decodeScreenLayoutTemplateRequest(w, r, &req); err != nil {
		writeScreenLayoutTemplateDecodeError(w, err)
		return
	}
	row, err := h.svc.Create(companyID, req.Name, req.Surface, req.Definition)
	if err != nil {
		if errors.Is(err, services.ErrScreenLayoutTemplateDefinitionTooLarge) {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
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
		if errors.Is(err, services.ErrScreenLayoutTemplateInvalidSurface) || errors.Is(err, services.ErrScreenLayoutTemplateSurfaceMismatch) {
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
	Surface    *string         `json:"surface,omitempty" enums:"ticket-station,queue-display,counter-display,visitor-mobile"`
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
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not found"
// @Failure      409 {string} string "Surface conflict"
// @Failure      413 {string} string "Request body too large"
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
	if err := decodeScreenLayoutTemplateRequest(w, r, &req); err != nil {
		writeScreenLayoutTemplateDecodeError(w, err)
		return
	}
	row, err := h.svc.Update(companyID, id, req.Name, req.Definition, req.Surface)
	if err != nil {
		if errors.Is(err, services.ErrScreenLayoutTemplateDefinitionTooLarge) {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
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
		if errors.Is(err, services.ErrScreenLayoutTemplateInvalidSurface) || errors.Is(err, services.ErrScreenLayoutTemplateSurfaceMismatch) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, services.ErrScreenLayoutTemplateSurfaceImmutable) {
			http.Error(w, err.Error(), http.StatusConflict)
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

func respondExperienceVersionError(w http.ResponseWriter, operation string, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, services.ErrScreenLayoutTemplatePlanDenied):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, services.ErrScreenLayoutTemplateInvalidDefinition):
		http.Error(w, services.ErrScreenLayoutTemplateInvalidDefinition.Error(), http.StatusBadRequest)
	case errors.Is(err, services.ErrExperienceVersionConflict):
		http.Error(w, "publish conflict", http.StatusConflict)
	case errors.Is(err, services.ErrExperienceVersionPaginationInvalid):
		http.Error(w, services.ErrExperienceVersionPaginationInvalid.Error(), http.StatusBadRequest)
	case errors.Is(err, gorm.ErrRecordNotFound):
		http.Error(w, "Not found", http.StatusNotFound)
	default:
		slog.Error(operation, "err", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
	return true
}

// PublishScreenLayoutTemplate godoc
// @ID           PublishScreenLayoutTemplate
// @Summary      Publish the current experience template draft
// @Description  Validates the tenant-owned mutable draft and atomically creates a new immutable published version.
// @Tags         companies
// @Produce      json
// @Param        templateId path string true "Template ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      201 {object} models.ExperienceTemplateVersion
// @Failure      400 {string} string "Draft is not publishable"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not found"
// @Failure      409 {string} string "Version conflict"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates/{templateId}/publish [post]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) Publish(w http.ResponseWriter, r *http.Request) {
	actorID, companyID, ok := h.resolveActorAndCompany(w, r)
	if !ok {
		return
	}
	version, err := h.svc.Publish(r.Context(), companyID, chi.URLParam(r, "templateId"), actorID)
	if respondExperienceVersionError(w, "PublishScreenLayoutTemplate", err) {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(version)
}

// ListScreenLayoutTemplateVersions godoc
// @ID           ListScreenLayoutTemplateVersions
// @Summary      List published experience template versions
// @Description  Returns metadata only in descending version order; immutable definitions are excluded from history pages.
// @Tags         companies
// @Produce      json
// @Param        templateId path string true "Template ID"
// @Param        limit query int false "Page size (default 20, maximum 100)"
// @Param        beforeVersion query int false "Return versions lower than this version number"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      200 {object} models.ExperienceTemplateVersionPage
// @Failure      400 {string} string "Invalid pagination"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not found"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates/{templateId}/versions [get]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	_, companyID, ok := h.resolveActorAndCompany(w, r)
	if !ok {
		return
	}
	limit := services.DefaultExperienceVersionPageSize
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsed, parseErr := strconv.Atoi(rawLimit)
		if parseErr != nil || parsed < 1 || parsed > services.MaxExperienceVersionPageSize {
			http.Error(w, services.ErrExperienceVersionPaginationInvalid.Error(), http.StatusBadRequest)
			return
		}
		limit = parsed
	}
	var beforeVersion *int
	if rawBefore := r.URL.Query().Get("beforeVersion"); rawBefore != "" {
		parsed, parseErr := strconv.Atoi(rawBefore)
		if parseErr != nil || parsed < 1 {
			http.Error(w, services.ErrExperienceVersionPaginationInvalid.Error(), http.StatusBadRequest)
			return
		}
		beforeVersion = &parsed
	}
	versions, err := h.svc.ListVersions(r.Context(), companyID, chi.URLParam(r, "templateId"), beforeVersion, limit)
	if respondExperienceVersionError(w, "ListScreenLayoutTemplateVersions", err) {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(versions)
}

// RestoreScreenLayoutTemplateVersion godoc
// @ID           RestoreScreenLayoutTemplateVersion
// @Summary      Restore an experience template version
// @Description  Copies one tenant-owned historical definition into a new immutable latest version and advances the published pointer.
// @Tags         companies
// @Produce      json
// @Param        templateId path string true "Template ID"
// @Param        versionId path string true "Historical version ID"
// @Param        X-Company-Id header string false "Tenant company UUID when the user belongs to multiple organizations"
// @Success      201 {object} models.ExperienceTemplateVersion
// @Failure      400 {string} string "Historical definition is not publishable"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not found"
// @Failure      409 {string} string "Version conflict"
// @Failure      500 {string} string "Internal error"
// @Router       /companies/me/screen-layout-templates/{templateId}/versions/{versionId}/restore [post]
// @Security     BearerAuth
func (h *ScreenLayoutTemplateHandler) Restore(w http.ResponseWriter, r *http.Request) {
	actorID, companyID, ok := h.resolveActorAndCompany(w, r)
	if !ok {
		return
	}
	version, err := h.svc.Restore(
		r.Context(),
		companyID,
		chi.URLParam(r, "templateId"),
		chi.URLParam(r, "versionId"),
		actorID,
	)
	if respondExperienceVersionError(w, "RestoreScreenLayoutTemplateVersion", err) {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(version)
}

// DeleteScreenLayoutTemplate godoc
// @ID           DeleteScreenLayoutTemplate
// @Summary      Delete a screen layout template
// @Tags         companies
// @Param        templateId path string true "Template ID"
// @Success      204
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Not found"
// @Failure      409 {string} string "Template is assigned to a terminal"
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
		if errors.Is(err, services.ErrExperienceTemplateAssigned) {
			RespondJSONWithStatus(w, http.StatusConflict, map[string]string{
				"code":    "experience_template_assigned",
				"message": services.ErrExperienceTemplateAssigned.Error(),
			})
			return
		}
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
