package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
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

func operationsHTTPStatus(err error) int {
	if err == nil {
		return http.StatusOK
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

// GetOperationsStatus godoc
// @ID           getUnitOperationsStatus
// @Summary      Unit operations / EOD pipeline status
// @Tags         operations
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Success      200 {object} services.OperationsStatusDTO
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden (not tenant admin)"
// @Failure      404 {string} string "Unit not found"
// @Failure      500 {string} string "Internal server error"
// @Router       /units/{unitId}/operations/status [get]
func (h *OperationsHandler) GetOperationsStatus(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	if _, ok := h.requireTenantAdmin(r); !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	st, err := h.opService.GetStatus(unitID)
	if err != nil {
		http.Error(w, err.Error(), operationsHTTPStatus(err))
		return
	}
	RespondJSON(w, st)
}

// emergencyUnlockBody is the JSON body for emergency unlock; confirm must be the literal UNLOCK.
type emergencyUnlockBody struct {
	Confirm string `json:"confirm" binding:"required" example:"UNLOCK" enums:"UNLOCK"`
}

// PostEmergencyUnlock godoc
// @ID           postUnitOperationsEmergencyUnlock
// @Summary      Emergency unlock kiosk and counter login
// @Description  Destructive admin operation: clears kiosk admission freeze and counter-login blocks for the subdivision. JSON body required; confirm must equal UNLOCK exactly.
// @Tags         operations
// @Security     BearerAuth
// @Accept       json
// @Param        unitId path string true "Subdivision unit ID"
// @Param        body body emergencyUnlockBody true "Required. Send confirm equal to UNLOCK."
// @Success      204 "No Content"
// @Failure      400 {string} string "Bad Request (confirm not UNLOCK or invalid JSON)"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden (not tenant admin)"
// @Failure      404 {string} string "Unit not found"
// @Failure      500 {string} string "Internal server error (unlock failed or audit log failed)"
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
		http.Error(w, err.Error(), operationsHTTPStatus(err))
		return
	}
	payload, _ := json.Marshal(map[string]string{"unitId": unitID})
	if err := h.auditRepo.CreateAuditLog(r.Context(), &models.AuditLog{
		UserID:  &uid,
		Action:  "operations.emergency_unlock",
		Payload: payload,
	}); err != nil {
		log.Printf("operations emergency_unlock audit log unitId=%q: %v", unitID, err)
		http.Error(w, "unlock applied but audit log failed", http.StatusInternalServerError)
		return
	}
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
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden (not tenant admin)"
// @Failure      404 {string} string "Unit not found"
// @Failure      500 {string} string "Internal server error (clear failed or audit log failed)"
// @Router       /units/{unitId}/operations/clear-statistics-quiet [post]
func (h *OperationsHandler) PostClearStatisticsQuiet(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	uid, ok := h.requireTenantAdmin(r)
	if !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := h.opService.ClearStatisticsQuiet(unitID); err != nil {
		http.Error(w, err.Error(), operationsHTTPStatus(err))
		return
	}
	payload, _ := json.Marshal(map[string]string{"unitId": unitID})
	if err := h.auditRepo.CreateAuditLog(r.Context(), &models.AuditLog{
		UserID:  &uid,
		Action:  "operations.clear_statistics_quiet",
		Payload: payload,
	}); err != nil {
		log.Printf("operations clear_statistics_quiet audit log unitId=%q: %v", unitID, err)
		http.Error(w, "quiet flag cleared but audit log failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
