package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// OperatorSkillHandler serves CRUD endpoints for operator-service skill mappings.
type OperatorSkillHandler struct {
	skillRepo   repository.OperatorSkillRepository
	userRepo    repository.UserRepository
	serviceRepo repository.ServiceRepository
}

func NewOperatorSkillHandler(
	skillRepo repository.OperatorSkillRepository,
	userRepo repository.UserRepository,
	serviceRepo repository.ServiceRepository,
) *OperatorSkillHandler {
	return &OperatorSkillHandler{skillRepo: skillRepo, userRepo: userRepo, serviceRepo: serviceRepo}
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
	Skills []operatorSkillInput `json:"skills" binding:"required"`
}

// operatorSkillInput is a single mapping to insert/update.
type operatorSkillInput struct {
	UserID    string `json:"userId" binding:"required"`
	ServiceID string `json:"serviceId" binding:"required"`
	Priority  int    `json:"priority" binding:"required,min=1,max=3"`
}

// UpsertOperatorSkills godoc
// @ID           upsertUnitOperatorSkills
// @Summary      Bulk upsert operator-skill mappings
// @Description  Insert or update (on conflict: update priority) multiple operator-service mappings for a unit.
// @Tags         operator-skills
// @Security     BearerAuth
// @Accept       json
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

	var req bulkUpsertSkillsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if len(req.Skills) == 0 {
		http.Error(w, "skills array is empty", http.StatusBadRequest)
		return
	}

	userIDs := make(map[string]struct{})
	serviceIDs := make(map[string]struct{})
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
		userIDs[uid] = struct{}{}
		serviceIDs[sid] = struct{}{}
		skills = append(skills, models.OperatorSkill{
			UnitID:    unitID,
			UserID:    uid,
			ServiceID: sid,
			Priority:  p,
		})
	}

	uniqUsers := make([]string, 0, len(userIDs))
	for u := range userIDs {
		uniqUsers = append(uniqUsers, u)
	}
	uniqServices := make([]string, 0, len(serviceIDs))
	for sid := range serviceIDs {
		uniqServices = append(uniqServices, sid)
	}

	nUsers, err := h.userRepo.CountUsersWithMembershipInUnitBranch(unitID, uniqUsers)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if nUsers != int64(len(uniqUsers)) {
		http.Error(w, "one or more userIds are not members of this unit", http.StatusBadRequest)
		return
	}
	nSvcs, err := h.serviceRepo.CountByUnitSubtreeAndIDs(unitID, uniqServices)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if nSvcs != int64(len(uniqServices)) {
		http.Error(w, "one or more serviceIds do not belong to this unit", http.StatusBadRequest)
		return
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
	if err := h.skillRepo.DeleteByID(unitID, skillID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
