package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
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
// @Produce      application/pdf,text/plain
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "Start date (YYYY-MM-DD)"
// @Param        dateTo query string true "End date (YYYY-MM-DD)"
// @Param        userId query string false "Filter by operator/user ID (exact match)"
// @Param        serviceZoneId query string false "Filter by service zone ID (exact match)"
// @Param        surveyId query string false "Filter survey scores by survey definition ID"
// @Param        questionIds query []string false "Filter survey scores by question IDs (repeatable)"
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

	var surveyID *string
	if v := strings.TrimSpace(r.URL.Query().Get("surveyId")); v != "" {
		surveyID = &v
	}
	questionIDs := parseStatisticsQuestionIDs(r.URL.Query())

	locale := middleware.GetLocale(r.Context())
	labels := services.StatsPDFLabelsEN()
	if locale == "ru" {
		labels = services.StatsPDFLabelsRU()
	}

	ctx := r.Context()
	input := services.StatisticsPDFInput{
		UnitName: unit.Name,
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Labels:   labels,
	}
	if reqUser != nil {
		input.FilterOperator = *reqUser
	}
	if svcZone != "" {
		input.FilterZone = svcZone
	}

	responded := false
	handleStatsErr := func(err error) bool {
		if err == nil {
			return false
		}
		if respondStatisticsServiceErr(w, err) {
			responded = true
			return true
		}
		http.Error(w, "Failed to export statistics PDF", http.StatusInternalServerError)
		responded = true
		return true
	}

	ts, err := h.service.GetTimeseries(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, "wait_time", reqUser, svcZone)
	if handleStatsErr(err) {
		return
	}
	input.Timeseries = ts

	sla, err := h.service.GetSLADeviations(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone)
	if handleStatsErr(err) {
		return
	}
	input.SLADeviations = sla

	load, err := h.service.GetLoad(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone)
	if handleStatsErr(err) {
		return
	}
	input.Load = load

	tbs, err := h.service.GetTicketsByService(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone)
	if handleStatsErr(err) {
		return
	}
	input.TicketsSvc = tbs

	sum, err := h.service.GetSlaSummary(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone, "")
	if handleStatsErr(err) {
		return
	}
	input.SlaSummary = sum

	if repository.UserCanViewSurveyScoreAggregates(user, unitID) {
		scores, err := h.service.GetSurveyScores(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, surveyID, questionIDs)
		if handleStatsErr(err) {
			return
		}
		input.SurveyScores = scores
	}

	if reqUser != nil && strings.TrimSpace(*reqUser) != "" {
		util, err := h.service.GetUtilization(ctx, unitID, companyID, user, viewerID, *reqUser, dateFrom, dateTo)
		if handleStatsErr(err) {
			return
		}
		input.Utilization = util

		radar, err := h.service.GetEmployeeRadar(ctx, unitID, companyID, user, viewerID, *reqUser)
		if handleStatsErr(err) {
			return
		}
		input.EmployeeRadar = radar
	}

	// Include staff performance leaderboard when the viewer has access to advanced reports.
	leaderboard, lErr := h.service.GetStaffPerformanceList(ctx, unitID, companyID, user, viewerID, dateFrom, dateTo, "ticketsCompleted", "desc")
	if lErr == nil {
		input.StaffLeaderboard = leaderboard
	}

	// Include staffing forecast for the next business day (best-effort).
	forecastParams := services.StaffingForecastParams{}
	forecast, fErr := h.service.GetStaffingForecast(ctx, unitID, forecastParams)
	if fErr == nil {
		input.StaffForecast = forecast
	}

	_ = responded

	pdfBytes, err := services.BuildStatisticsPDF(input)
	if err != nil {
		http.Error(w, "Failed to generate PDF: "+err.Error(), http.StatusInternalServerError)
		return
	}

	utf8Name := statisticsPDFFilename(unit.Name, dateFrom, dateTo)
	asciiName := nonASCIIReplacer.ReplaceAllString(utf8Name, "_")

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		`attachment; filename="`+asciiName+`"; filename*=UTF-8''`+url.PathEscape(utf8Name))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(pdfBytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdfBytes)
}

var nonASCIIReplacer = regexp.MustCompile(`[^\x20-\x7E]`)

func statisticsPDFFilename(unitName, dateFrom, dateTo string) string {
	safe := strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return '_'
		}
		return r
	}, unitName)
	runes := []rune(safe)
	if len(runes) > 60 {
		safe = string(runes[:60])
	}
	return fmt.Sprintf("%s_%s_%s.pdf", safe, dateFrom, dateTo)
}
