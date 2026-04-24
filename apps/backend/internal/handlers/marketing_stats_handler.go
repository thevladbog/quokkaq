package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

// PublicMarketingStatsResponse is JSON for GET /public/marketing-stats.
type PublicMarketingStatsResponse struct {
	// ActiveCompanies counts tenant companies excluding the SaaS operator row (snapshot at request time).
	ActiveCompanies int64 `json:"activeCompanies" binding:"required" minimum:"0" example:"42" format:"int64"`
	// ActiveHumanUsers counts active human user accounts across tenants (snapshot at request time).
	ActiveHumanUsers int64 `json:"activeHumanUsers" binding:"required" minimum:"0" example:"12" format:"int64"`
}

// MarketingStatsHandler exposes coarse public counts for the marketing site.
type MarketingStatsHandler struct {
	db *gorm.DB
}

// NewMarketingStatsHandler constructs MarketingStatsHandler.
func NewMarketingStatsHandler(db *gorm.DB) *MarketingStatsHandler {
	return &MarketingStatsHandler{db: db}
}

// GetPublicMarketingStats godoc
// @ID           getPublicMarketingStats
// @Summary      Public marketing aggregate counts
// @Description  Returns non-sensitive counts for the public marketing landing (tenant companies excluding the SaaS operator row, and active human users). Cached briefly via HTTP headers.
// @Tags         marketing
// @Produce      json
// @Success      200  {object}  PublicMarketingStatsResponse
// @Header       200  {string}  Cache-Control  "Short-lived public cache for this JSON response (e.g. `public, max-age=300`)."
// @Failure      500  {string}  string  "Internal server error"
// @Router       /public/marketing-stats [get]
func (h *MarketingStatsHandler) GetPublicMarketingStats(w http.ResponseWriter, r *http.Request) {
	if h.db == nil {
		http.Error(w, "database unavailable", http.StatusInternalServerError)
		return
	}

	var companies int64
	if err := h.db.Model(&models.Company{}).
		Where("is_saas_operator = ?", false).
		Count(&companies).Error; err != nil {
		http.Error(w, "failed to count companies", http.StatusInternalServerError)
		return
	}

	var users int64
	if err := h.db.Model(&models.User{}).
		Where("is_active = ? AND type = ?", true, "human").
		Count(&users).Error; err != nil {
		http.Error(w, "failed to count users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")

	resp := PublicMarketingStatsResponse{
		ActiveCompanies:  companies,
		ActiveHumanUsers: users,
	}
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(resp); err != nil {
		slog.Error("GetPublicMarketingStats: failed to encode JSON response", "err", err)
	}
}
