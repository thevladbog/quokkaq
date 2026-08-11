package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

const maxUnitExperienceAssignmentBodyBytes int64 = 4 << 10

type unitExperienceService interface {
	ResolveUnitQueueDisplay(context.Context, string, string) (*services.TerminalExperienceManifest, error)
	UpdateUnitQueueDisplayExperience(context.Context, string, string, repository.UnitExperienceAssignment) error
}

// UnitExperienceHandler serves the public queue-display manifest and the
// authenticated unit assignment mutation.
type UnitExperienceHandler struct {
	service  unitExperienceService
	userRepo repository.UserRepository
}

func NewUnitExperienceHandler(service unitExperienceService, userRepo repository.UserRepository) *UnitExperienceHandler {
	return &UnitExperienceHandler{service: service, userRepo: userRepo}
}

type unitExperienceAssignmentRequest struct {
	TemplateID json.RawMessage `json:"templateId"`
	VariantID  json.RawMessage `json:"variantId"`
}

func decodeOptionalAssignmentString(raw json.RawMessage) (*string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("assignment ids must not be empty")
	}
	return &value, nil
}

// PatchUnitQueueDisplayExperience godoc
// @ID           PatchUnitQueueDisplayExperience
// @Summary      Assign a queue-display experience to a unit
// @Description  Assigns a published queue-display template and variant to a public unit screen, or clears the assignment when both values are null.
// @Tags         units
// @Accept       json
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        body body unitExperienceAssignmentRequest true "Queue-display assignment"
// @Success      204
// @Failure      400 {string} string "Invalid assignment"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Unit or template not found"
// @Failure      409 {string} string "Assignment is unavailable"
// @Router       /units/{unitId}/queue-display-experience [patch]
// @Security     BearerAuth
func (h *UnitExperienceHandler) Patch(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	companyID, err := h.userRepo.ResolveCompanyIDForRequest(userID, r.Header.Get("X-Company-Id"))
	if err != nil {
		if errors.Is(err, repository.ErrCompanyAccessDenied) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		http.Error(w, "Company context required", http.StatusBadRequest)
		return
	}

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxUnitExperienceAssignmentBodyBytes))
	decoder.DisallowUnknownFields()
	var request unitExperienceAssignmentRequest
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid assignment", http.StatusBadRequest)
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		http.Error(w, "invalid assignment", http.StatusBadRequest)
		return
	}
	if request.TemplateID == nil || request.VariantID == nil {
		http.Error(w, "templateId and variantId must both be present", http.StatusBadRequest)
		return
	}
	templateID, err := decodeOptionalAssignmentString(request.TemplateID)
	if err != nil {
		http.Error(w, "invalid templateId", http.StatusBadRequest)
		return
	}
	variantID, err := decodeOptionalAssignmentString(request.VariantID)
	if err != nil {
		http.Error(w, "invalid variantId", http.StatusBadRequest)
		return
	}
	if err := h.service.UpdateUnitQueueDisplayExperience(r.Context(), companyID, chi.URLParam(r, "unitId"), repository.UnitExperienceAssignment{TemplateID: templateID, VariantID: variantID}); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			http.Error(w, "Not found", http.StatusNotFound)
		case errors.Is(err, services.ErrExperienceAssignmentIncomplete),
			errors.Is(err, services.ErrExperienceAssignmentIncompatible),
			errors.Is(err, services.ErrExperienceTemplateUnpublished),
			errors.Is(err, services.ErrExperienceVariantNotFound),
			errors.Is(err, services.ErrExperiencePublishedDefinitionInvalid):
			http.Error(w, "Assignment is unavailable", http.StatusConflict)
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetUnitQueueDisplayExperience godoc
// @ID           GetUnitQueueDisplayExperience
// @Summary      Get a unit queue-display experience manifest
// @Description  Returns the current immutable published queue-display experience assigned to a unit, or legacy mode when no usable assignment exists.
// @Tags         units
// @Produce      json
// @Param        unitId path string true "Unit ID"
// @Param        profile query string false "Viewport orientation" Enums(portrait, landscape)
// @Success      200 {object} services.TerminalExperienceManifest
// @Failure      500 {string} string "Internal server error"
// @Router       /units/{unitId}/queue-display-experience [get]
func (h *UnitExperienceHandler) Manifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	profile := strings.TrimSpace(r.URL.Query().Get("profile"))
	if profile != "" && profile != "portrait" && profile != "landscape" {
		http.Error(w, "invalid profile", http.StatusBadRequest)
		return
	}
	manifest, err := h.service.ResolveUnitQueueDisplay(r.Context(), chi.URLParam(r, "unitId"), profile)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound),
			errors.Is(err, services.ErrExperienceTemplateUnpublished),
			errors.Is(err, services.ErrExperienceAssignmentIncomplete),
			errors.Is(err, services.ErrExperienceAssignmentIncompatible),
			errors.Is(err, services.ErrExperienceVariantNotFound),
			errors.Is(err, services.ErrExperiencePublishedDefinitionInvalid):
			manifest = &services.TerminalExperienceManifest{Mode: services.TerminalExperienceModeLegacy}
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}
	if manifest == nil {
		manifest = &services.TerminalExperienceManifest{Mode: services.TerminalExperienceModeLegacy}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(manifest)
}
