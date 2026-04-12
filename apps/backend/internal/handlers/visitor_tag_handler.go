package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// VisitorTagHandler serves CRUD for unit visitor tag definitions.
type VisitorTagHandler struct {
	svc services.VisitorTagDefinitionService
}

func NewVisitorTagHandler(svc services.VisitorTagDefinitionService) *VisitorTagHandler {
	return &VisitorTagHandler{svc: svc}
}

// ListVisitorTagDefinitions godoc
// @Summary      List visitor tag definitions for a unit
// @Description  Returns label/color tag definitions scoped to the unit, ordered by sortOrder then label.
// @Tags         units
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Success      200 {array} models.UnitVisitorTagDefinition
// @Router       /units/{unitId}/visitor-tag-definitions [get]
func (h *VisitorTagHandler) ListVisitorTagDefinitions(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	items, err := h.svc.ListByUnit(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, items)
}

type createVisitorTagDefinitionRequest struct {
	Label     string `json:"label" binding:"required"`
	Color     string `json:"color" binding:"required"`
	SortOrder *int   `json:"sortOrder"`
}

// CreateVisitorTagDefinition godoc
// @Summary      Create visitor tag definition
// @Description  Creates a tag definition (label + #RRGGBB color) for the unit.
// @Tags         units
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Param        body body createVisitorTagDefinitionRequest true "Payload"
// @Success      201 {object} models.UnitVisitorTagDefinition
// @Failure      400 {string} string "Bad Request"
// @Router       /units/{unitId}/visitor-tag-definitions [post]
func (h *VisitorTagHandler) CreateVisitorTagDefinition(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	var req createVisitorTagDefinitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, err := h.svc.Create(unitID, req.Label, req.Color, req.SortOrder)
	if err != nil {
		if errors.Is(err, services.ErrVisitorTagInvalidColor) || errors.Is(err, services.ErrVisitorTagLabelRequired) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSONWithStatus(w, http.StatusCreated, row)
}

type patchVisitorTagDefinitionRequest struct {
	Label     *string `json:"label"`
	Color     *string `json:"color"`
	SortOrder *int    `json:"sortOrder"`
}

// PatchVisitorTagDefinition godoc
// @Summary      Update visitor tag definition
// @Description  Partially updates a tag definition. Omitted fields are unchanged.
// @Tags         units
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Param        definitionId path string true "Definition ID"
// @Param        body body patchVisitorTagDefinitionRequest true "Payload"
// @Success      200 {object} models.UnitVisitorTagDefinition
// @Failure      400 {string} string "Bad Request"
// @Failure      404 {string} string "Not Found"
// @Router       /units/{unitId}/visitor-tag-definitions/{definitionId} [patch]
func (h *VisitorTagHandler) PatchVisitorTagDefinition(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	definitionID := chi.URLParam(r, "definitionId")
	var req patchVisitorTagDefinitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, err := h.svc.Update(unitID, definitionID, req.Label, req.Color, req.SortOrder)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		if errors.Is(err, services.ErrVisitorTagInvalidColor) || errors.Is(err, services.ErrVisitorTagLabelRequired) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, row)
}

// DeleteVisitorTagDefinition godoc
// @Summary      Delete visitor tag definition
// @Description  Deletes a tag definition; assignments on clients are removed (cascade).
// @Tags         units
// @Security     BearerAuth
// @Param        unitId path string true "Unit ID"
// @Param        definitionId path string true "Definition ID"
// @Success      204  {object}  nil
// @Failure      404 {string} string "Not Found"
// @Router       /units/{unitId}/visitor-tag-definitions/{definitionId} [delete]
func (h *VisitorTagHandler) DeleteVisitorTagDefinition(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	definitionID := chi.URLParam(r, "definitionId")
	if err := h.svc.Delete(unitID, definitionID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
