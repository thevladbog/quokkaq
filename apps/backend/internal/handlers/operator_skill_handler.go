package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// OperatorSkillHandler serves CRUD endpoints for operator-service skill mappings.
type OperatorSkillHandler struct {
	skillRepo repository.OperatorSkillRepository
	userRepo  repository.UserRepository
	unitRepo  repository.UnitRepository
}

func NewOperatorSkillHandler(
	skillRepo repository.OperatorSkillRepository,
	userRepo repository.UserRepository,
	unitRepo repository.UnitRepository,
) *OperatorSkillHandler {
	return &OperatorSkillHandler{skillRepo: skillRepo, userRepo: userRepo, unitRepo: unitRepo}
}

// requireUnitSkillsManage checks that the caller has PermUnitUsersManage on the given unit.
func (h *OperatorSkillHandler) requireUnitSkillsManage(r *http.Request, unitID string) (bool, string) {
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		return false, ""
	}
	user, err := h.userRepo.FindByID(r.Context(), viewerID)
	if err != nil {
		return false, ""
	}
	if repository.UserHasCanonicalUnitPermission(user, unitID, rbac.PermUnitUsersManage) {
		return true, viewerID
	}
	// Tenant admins bypass unit-level checks.
	for _, ur := range user.Roles {
		switch ur.Role.Name {
		case "admin", "platform_admin":
			return true, viewerID
		}
	}
	return false, viewerID
}

// ListOperatorSkills godoc
// @ID           listUnitOperatorSkills
// @Summary      List all operator-skill mappings for a unit
// @Tags         operator-skills
// @Security     BearerAuth
// @Param        unitId    path   string true  "Subdivision unit ID"
// @Param        userId    query  string false "Filter by operator user ID"
// @Param        serviceId query  string false "Filter by service ID"
// @Success      200 {array} models.OperatorSkill
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Unit not found"
// @Failure      500 {string} string "Internal server error"
// @Router       /units/{unitId}/operator-skills [get]
func (h *OperatorSkillHandler) ListOperatorSkills(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	allowed, _ := h.requireUnitSkillsManage(r, unitID)
	if !allowed {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	filterUser := strings.TrimSpace(r.URL.Query().Get("userId"))
	filterService := strings.TrimSpace(r.URL.Query().Get("serviceId"))
	var skills []models.OperatorSkill
	var err error
	switch {
	case filterUser != "":
		skills, err = h.skillRepo.ListByUnitAndUser(unitID, filterUser)
	case filterService != "":
		skills, err = h.skillRepo.ListByUnitAndService(unitID, filterService)
	default:
		skills, err = h.skillRepo.ListByUnit(unitID)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, skills)
}

// bulkUpsertSkillsRequest is the body for bulk upsert.
type bulkUpsertSkillsRequest struct {
	Skills []operatorSkillInput `json:"skills"`
}

// operatorSkillInput is a single mapping to insert/update.
type operatorSkillInput struct {
	UserID    string `json:"userId"`
	ServiceID string `json:"serviceId"`
	Priority  int    `json:"priority"`
}

// UpsertOperatorSkills godoc
// @ID           upsertUnitOperatorSkills
// @Summary      Bulk upsert operator-skill mappings
// @Description  Insert or update (on conflict: update priority) multiple operator-service mappings for a unit.
// @Tags         operator-skills
// @Security     BearerAuth
// @Param        unitId path   string              true "Subdivision unit ID"
// @Param        body   body   bulkUpsertSkillsRequest true "Skills to upsert"
// @Success      204
// @Failure      400 {string} string "Bad request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      500 {string} string "Internal server error"
// @Router       /units/{unitId}/operator-skills [put]
func (h *OperatorSkillHandler) UpsertOperatorSkills(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	allowed, _ := h.requireUnitSkillsManage(r, unitID)
	if !allowed {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req bulkUpsertSkillsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if len(req.Skills) == 0 {
		http.Error(w, "skills array is empty", http.StatusBadRequest)
		return
	}

	skills := make([]models.OperatorSkill, 0, len(req.Skills))
	for _, s := range req.Skills {
		uid := strings.TrimSpace(s.UserID)
		sid := strings.TrimSpace(s.ServiceID)
		if uid == "" || sid == "" {
			http.Error(w, "userId and serviceId are required per skill", http.StatusBadRequest)
			return
		}
		p := s.Priority
		if p < 1 || p > 3 {
			p = 1
		}
		skills = append(skills, models.OperatorSkill{
			UnitID:    unitID,
			UserID:    uid,
			ServiceID: sid,
			Priority:  p,
		})
	}

	if err := h.skillRepo.UpsertBulk(skills); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteOperatorSkill godoc
// @ID           deleteUnitOperatorSkill
// @Summary      Delete a single operator-skill mapping by ID
// @Tags         operator-skills
// @Security     BearerAuth
// @Param        unitId  path string true "Subdivision unit ID"
// @Param        skillId path string true "OperatorSkill ID"
// @Success      204
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      500 {string} string "Internal server error"
// @Router       /units/{unitId}/operator-skills/{skillId} [delete]
func (h *OperatorSkillHandler) DeleteOperatorSkill(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	skillID := chi.URLParam(r, "skillId")
	allowed, _ := h.requireUnitSkillsManage(r, unitID)
	if !allowed {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := h.skillRepo.DeleteByID(unitID, skillID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
