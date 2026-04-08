package handlers

import (
	"errors"
	"log"
	"net/http"
	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type UsageHandler struct {
	quotaService services.QuotaService
	userRepo     repository.UserRepository
}

func NewUsageHandler(quotaService services.QuotaService, userRepo repository.UserRepository) *UsageHandler {
	return &UsageHandler{
		quotaService: quotaService,
		userRepo:     userRepo,
	}
}

// GetUsageMetrics godoc
// @Summary      Get Usage Metrics
// @Description  Returns current resource usage and limits for the company
// @Tags         usage
// @Produce      json
// @Security     BearerAuth
// @Param        companyId path string true "Company ID"
// @Success      200  {object}  handlers.UsageMetricsResponse
// @Failure      400  {string}  string "Bad Request"
// @Failure      401  {string}  string "Unauthorized"
// @Failure      403  {string}  string "Forbidden"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /companies/{companyId}/usage-metrics [get]
func (h *UsageHandler) GetUsageMetrics(w http.ResponseWriter, r *http.Request) {
	companyID := chi.URLParam(r, "companyId")

	// Verify user has access to this company
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Verify user has access to this company by checking their units
	hasAccess, err := h.userRepo.HasCompanyAccess(userID, companyID)
	if err != nil {
		log.Printf("GetUsageMetrics userRepo.HasCompanyAccess: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !hasAccess {
		http.Error(w, "Forbidden: You do not have access to this company", http.StatusForbidden)
		return
	}

	metrics, err := h.quotaService.GetUsageMetrics(companyID)
	if err != nil {
		log.Printf("GetUsageMetrics quotaService.GetUsageMetrics(%q): %v", companyID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, usageMetricsToResponse(metrics))
}

// GetMyUsageMetrics godoc
// @Summary      Get Current User's Usage Metrics
// @Description  Returns current resource usage and limits for the authenticated user's company
// @Tags         usage
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  handlers.UsageMetricsResponse
// @Failure      401  {string}  string "Unauthorized"
// @Failure      404  {string}  string "User has no units or company"
// @Failure      500  {string}  string "Internal Server Error"
// @Router       /usage-metrics/me [get]
func (h *UsageHandler) GetMyUsageMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	result, err := h.userRepo.GetFirstUserUnit(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "User has no associated units or company", http.StatusNotFound)
			return
		}
		log.Printf("GetMyUsageMetrics userRepo.GetFirstUserUnit: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	metrics, err := h.quotaService.GetUsageMetrics(result.CompanyID)
	if err != nil {
		log.Printf("GetMyUsageMetrics quotaService.GetUsageMetrics(%q): %v", result.CompanyID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	RespondJSON(w, usageMetricsToResponse(metrics))
}
