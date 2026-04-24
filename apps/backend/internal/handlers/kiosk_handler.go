package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// KioskHandler is kiosk operations (5.1 telemetry, 5.1 analytics, 5.2 eta refresh).
type KioskHandler struct {
	db        *gorm.DB
	analytics *services.KioskAnalyticsService
	etaCal    *services.KioskETACalibrationService
	unitRepo  repository.UnitRepository
}

// NewKioskHandler constructs a handler.
func NewKioskHandler(db *gorm.DB, unitRepo repository.UnitRepository) *KioskHandler {
	return &KioskHandler{
		db:        db,
		analytics: services.NewKioskAnalyticsService(db),
		etaCal:    services.NewKioskETACalibrationService(db, unitRepo),
		unitRepo:  unitRepo,
	}
}

// GetKioskAnalytics godoc
// @Summary      Kiosk operations analytics
// @Description  Aggregated tickets, funnel, telemetry for a unit. Requires plan feature kiosk_operations_analytics and statistics access.
// @Tags         units
// @Produce      json
// @Param        unitId path  string  true  "Unit ID"
// @Param        from  query string  false "RFC3339 or YYYY-MM-DD (default: 7d ago)"
// @Param        to    query string  false "RFC3339 or YYYY-MM-DD (default: now)"
// @Param        format query string false "json (default) or csv"
// @Success      200
// @Failure      403
// @Router       /units/{unitId}/kiosk-analytics [get]
func (h *KioskHandler) GetKioskAnalytics(w http.ResponseWriter, r *http.Request) {
	unitID := strings.TrimSpace(chi.URLParam(r, "unitId"))
	if unitID == "" {
		http.Error(w, "unitId required", http.StatusBadRequest)
		return
	}
	from, to, err := services.ParseKioskAnalyticsRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	u, err := h.unitRepo.FindByIDLight(unitID)
	if err != nil {
		http.Error(w, "unit not found", http.StatusNotFound)
		return
	}
	res, err := h.analytics.GetKioskAnalytics(u.CompanyID, unitID, from, to)
	if err != nil {
		if errors.Is(err, services.ErrKioskPlanFeature) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.EqualFold(r.URL.Query().Get("format"), "csv") {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		_ = services.WriteKioskAnalyticsCSV(w, res)
		return
	}
	RespondJSON(w, res)
}

// PostKioskTelemetryRequest is a batch-friendly telemetry sample.
type PostKioskTelemetryRequest struct {
	Kind string         `json:"kind"` // api_ping | print_error | paper_out | heartbeat
	Meta map[string]any `json:"meta,omitempty"`
}

// PostKioskTelemetry ingests high-frequency but small JSON samples (5.1).
// @Tags         units
// @Param        unitId path string true "Unit ID"
// @Param        body   body  PostKioskTelemetryRequest true "Sample"
// @Success      204  {object}  nil
// @Router       /units/{unitId}/kiosk-telemetry [post]
func (h *KioskHandler) PostKioskTelemetry(w http.ResponseWriter, r *http.Request) {
	unitID := strings.TrimSpace(chi.URLParam(r, "unitId"))
	if unitID == "" {
		http.Error(w, "unitId required", http.StatusBadRequest)
		return
	}
	var body PostKioskTelemetryRequest
	if err := decodeKioskJSON(r, &body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	kind := strings.TrimSpace(body.Kind)
	if kind == "" {
		http.Error(w, "kind is required", http.StatusBadRequest)
		return
	}
	u, err := h.unitRepo.FindByIDLight(unitID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	ev := models.KioskTelemetryEvent{
		CompanyID: u.CompanyID,
		UnitID:    unitID,
		Kind:      kind,
		Meta:      services.MetaJSON(body.Meta),
	}
	if err := h.db.Create(&ev).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PostKioskETARefresh rebuilds smart ETA slot calibration (5.2). Plan: kiosk_smart_eta.
// @Tags         units
// @Param        unitId path string true "Unit ID"
// @Success      204  {object}  nil
// @Router       /units/{unitId}/kiosk-eta-refresh [post]
func (h *KioskHandler) PostKioskETARefresh(w http.ResponseWriter, r *http.Request) {
	unitID := strings.TrimSpace(chi.URLParam(r, "unitId"))
	if unitID == "" {
		http.Error(w, "unitId required", http.StatusBadRequest)
		return
	}
	u, err := h.unitRepo.FindByIDLight(unitID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	ok, err := services.CompanyHasPlanFeature(u.CompanyID, services.PlanFeatureKioskSmartETA)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "kiosk smart ETA not on plan", http.StatusForbidden)
		return
	}
	if err := h.etaCal.RefreshForUnit(unitID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func decodeKioskJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}
