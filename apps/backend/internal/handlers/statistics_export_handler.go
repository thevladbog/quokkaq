package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// StatisticsExportHandler serves statistics export endpoints (PDF).
type StatisticsExportHandler struct {
	service  *services.StatisticsService
	userRepo repository.UserRepository
	unitRepo repository.UnitRepository
}

func NewStatisticsExportHandler(
	service *services.StatisticsService,
	userRepo repository.UserRepository,
	unitRepo repository.UnitRepository,
) *StatisticsExportHandler {
	return &StatisticsExportHandler{service: service, userRepo: userRepo, unitRepo: unitRepo}
}

// ExportPDF godoc
// @ID           exportStatisticsPDF
// @Summary      Export statistics as PDF report
// @Description  Generates a branded A4 PDF with all available statistics sections for the chosen date range. Same auth as individual statistics endpoints.
// @Tags         statistics
// @Security     BearerAuth
// @Produce      application/pdf
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "Start date YYYY-MM-DD"
// @Param        dateTo query string true "End date YYYY-MM-DD"
// @Param        userId query string false "Operator filter"
// @Param        serviceZoneId query string false "Service zone filter"
// @Success      200 {file} binary "PDF report"
// @Failure      400 {string} string "Bad Request"
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Failure      404 {string} string "Unit not found"
// @Failure      500 {string} string "Internal server error"
// @Router       /units/{unitId}/statistics/export/pdf [get]
func (h *StatisticsExportHandler) ExportPDF(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(r.Context(), viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	unit, err := h.unitRepo.FindByIDLight(unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	companyID := unit.CompanyID

	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required (YYYY-MM-DD)", http.StatusBadRequest)
		return
	}

	var reqUser *string
	if v := strings.TrimSpace(r.URL.Query().Get("userId")); v != "" {
		reqUser = &v
	}
	svcZone := strings.TrimSpace(r.URL.Query().Get("serviceZoneId"))

	ctx := r.Context()
	input := services.StatisticsPDFInput{
		UnitName: unit.Name,
		DateFrom: dateFrom,
		DateTo:   dateTo,
	}

	// Collect all statistics sections; individual errors are non-fatal — the section is simply omitted.

	if ts, err := h.service.GetTimeseries(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, "wait_time", reqUser, svcZone); err == nil {
		input.Timeseries = ts
	}

	if sla, err := h.service.GetSLADeviations(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone); err == nil {
		input.SLADeviations = sla
	}

	if load, err := h.service.GetLoad(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone); err == nil {
		input.Load = load
	}

	if tbs, err := h.service.GetTicketsByService(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone); err == nil {
		input.TicketsSvc = tbs
	}

	if sum, err := h.service.GetSlaSummary(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone, ""); err == nil {
		input.SlaSummary = sum
	}

	if scores, err := h.service.GetSurveyScores(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, nil, nil); err == nil {
		input.SurveyScores = scores
	}

	if reqUser != nil && strings.TrimSpace(*reqUser) != "" {
		if util, err := h.service.GetUtilization(ctx, unitID, companyID, user, viewerID, *reqUser, dateFrom, dateTo); err == nil {
			input.Utilization = util
		}
		if radar, err := h.service.GetEmployeeRadar(ctx, unitID, companyID, user, viewerID, *reqUser); err == nil {
			input.EmployeeRadar = radar
		}
	}

	pdfBytes, err := services.BuildStatisticsPDF(input)
	if err != nil {
		http.Error(w, "Failed to generate PDF: "+err.Error(), http.StatusInternalServerError)
		return
	}

	safeName := strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return '_'
		}
		return r
	}, unit.Name)
	if len(safeName) > 60 {
		safeName = safeName[:60]
	}
	filename := fmt.Sprintf("%s_%s_%s.pdf", safeName, dateFrom, dateTo)

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(pdfBytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdfBytes)
}
