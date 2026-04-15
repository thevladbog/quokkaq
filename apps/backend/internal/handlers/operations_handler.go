package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type OperationsHandler struct {
	opService *services.OperationalService
	userRepo  repository.UserRepository
	auditRepo repository.AuditLogRepository
}

func NewOperationsHandler(
	opService *services.OperationalService,
	userRepo repository.UserRepository,
	auditRepo repository.AuditLogRepository,
) *OperationsHandler {
	return &OperationsHandler{opService: opService, userRepo: userRepo, auditRepo: auditRepo}
}

func (h *OperationsHandler) requireTenantAdmin(r *http.Request) (string, bool) {
	uid, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || uid == "" {
		return "", false
	}
	isAdmin, err := h.userRepo.IsAdmin(uid)
	if err != nil || !isAdmin {
		return "", false
	}
	return uid, true
}

// GetOperationsStatus godoc
// @ID           getUnitOperationsStatus
// @Summary      Unit operations / EOD pipeline status
// @Tags         operations
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Success      200 {object} services.OperationsStatusDTO
// @Router       /units/{unitId}/operations/status [get]
func (h *OperationsHandler) GetOperationsStatus(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	if _, ok := h.requireTenantAdmin(r); !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	st, err := h.opService.GetStatus(unitID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, st)
}

type emergencyUnlockBody struct {
	// Confirm must be exactly UNLOCK. This acknowledges a destructive admin action: clears subdivision kiosk admission freeze and counter-login blocks (EOD recovery).
	Confirm string `json:"confirm" binding:"required" example:"UNLOCK" enums:"UNLOCK"`
}

// PostEmergencyUnlock godoc
// @ID           postUnitOperationsEmergencyUnlock
// @Summary      Emergency unlock kiosk and counter login
// @Description  Destructive admin operation: clears kiosk admission freeze and counter-login blocks for the subdivision. JSON body required; confirm must equal UNLOCK exactly.
// @Tags         operations
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        body body emergencyUnlockBody true "application/json: {\"confirm\":\"UNLOCK\"}"
// @Success      204 "No Content"
// @Router       /units/{unitId}/operations/emergency-unlock [post]
func (h *OperationsHandler) PostEmergencyUnlock(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	uid, ok := h.requireTenantAdmin(r)
	if !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body emergencyUnlockBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.Confirm) != "UNLOCK" {
		http.Error(w, `send {"confirm":"UNLOCK"}`, http.StatusBadRequest)
		return
	}
	if err := h.opService.EmergencyUnlockAll(unitID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	payload, _ := json.Marshal(map[string]string{"unitId": unitID})
	_ = h.auditRepo.CreateAuditLog(r.Context(), &models.AuditLog{
		UserID:  &uid,
		Action:  "operations.emergency_unlock",
		Payload: payload,
	})
	w.WriteHeader(http.StatusNoContent)
}

// PostClearStatisticsQuiet godoc
// @ID           postUnitOperationsClearStatisticsQuiet
// @Summary      Resume incremental statistics processing
// @Description  Admin-only: clears the statistics quiet flag so incremental statistics processing resumes for the subdivision. No request body.
// @Tags         operations
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Success      204
// @Router       /units/{unitId}/operations/clear-statistics-quiet [post]
func (h *OperationsHandler) PostClearStatisticsQuiet(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	uid, ok := h.requireTenantAdmin(r)
	if !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := h.opService.ClearStatisticsQuiet(unitID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	payload, _ := json.Marshal(map[string]string{"unitId": unitID})
	_ = h.auditRepo.CreateAuditLog(r.Context(), &models.AuditLog{
		UserID:  &uid,
		Action:  "operations.clear_statistics_quiet",
		Payload: payload,
	})
	w.WriteHeader(http.StatusNoContent)
}
