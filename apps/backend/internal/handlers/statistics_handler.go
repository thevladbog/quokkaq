package handlers

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"quokkaq-go-backend/internal/middleware"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type StatisticsHandler struct {
	service  *services.StatisticsService
	userRepo repository.UserRepository
	unitRepo repository.UnitRepository
}

func NewStatisticsHandler(
	service *services.StatisticsService,
	userRepo repository.UserRepository,
	unitRepo repository.UnitRepository,
) *StatisticsHandler {
	return &StatisticsHandler{service: service, userRepo: userRepo, unitRepo: unitRepo}
}

func parseStatisticsQuestionIDs(q url.Values) []string {
	parts := q["questionIds"]
	if len(parts) == 0 {
		if s := strings.TrimSpace(q.Get("questionIds")); s != "" {
			parts = strings.Split(s, ",")
		}
	}
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, chunk := range parts {
		for _, id := range strings.Split(chunk, ",") {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func (h *StatisticsHandler) subdivisionCompanyID(ctx context.Context, subdivisionID string) (string, error) {
	u, err := h.unitRepo.FindByIDLight(subdivisionID)
	if err != nil {
		return "", err
	}
	return u.CompanyID, nil
}

// GetTimeseries godoc
// @ID           getUnitStatisticsTimeseries
// @Summary      Statistics timeseries (daily or hourly for a single day)
// @Description  Daily metrics from statistics warehouse; single calendar day without operator filter yields hourly points with per-hour recomputed wait/service/SLA (same rules as daily rollup). Requires unit branch access and statistics scope (self or ACCESS_STATISTICS_* / supervisor / admin).
// @Description  Wait averages use queue time after the last ticket.transferred before the call. Service averages sum in_service episodes from ticket_histories (split by transfer / return-to-queue / recall / terminal status); warehouse service_count is the number of those segments with positive duration.
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        metric query string false "wait_time|service_time|volume|sla_wait" default(wait_time)
// @Param        userId query string false "Filter by operator (expanded scope only)"
// @Param        serviceZoneId query string false "Service zone unit id (child of subdivision); omit for allowed scope default"
// @Success      200 {object} services.TimeseriesResponse
// @Failure      401 {string} string "Unauthorized"
// @Failure      403 {string} string "Forbidden"
// @Router       /units/{unitId}/statistics/timeseries [get]
func (h *StatisticsHandler) GetTimeseries(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required (YYYY-MM-DD)", http.StatusBadRequest)
		return
	}
	metric := strings.TrimSpace(r.URL.Query().Get("metric"))
	if metric == "" {
		metric = "wait_time"
	}
	var reqUser *string
	if v := strings.TrimSpace(r.URL.Query().Get("userId")); v != "" {
		reqUser = &v
	}
	svcZone := strings.TrimSpace(r.URL.Query().Get("serviceZoneId"))
	resp, err := h.service.GetTimeseries(r.Context(), unitID, companyID, user, viewerID, dateFrom, dateTo, metric, reqUser, svcZone)
	if err != nil {
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "forbidden service zone") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "service zone not under subdivision") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetSLADeviations godoc
// @ID           getUnitStatisticsSlaDeviations
// @Summary      SLA waiting compliance vs breach per day
// @Description  Waiting SLA shares use the same queue segment definition as timeseries (post-transfer wait before call).
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        userId query string false "Filter by operator (expanded scope only)"
// @Param        serviceZoneId query string false "Service zone unit id (child of subdivision)"
// @Success      200 {object} services.SLADeviationsResponse
// @Router       /units/{unitId}/statistics/sla-deviations [get]
func (h *StatisticsHandler) GetSLADeviations(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required", http.StatusBadRequest)
		return
	}
	var reqUser *string
	if v := strings.TrimSpace(r.URL.Query().Get("userId")); v != "" {
		reqUser = &v
	}
	svcZone := strings.TrimSpace(r.URL.Query().Get("serviceZoneId"))
	resp, err := h.service.GetSLADeviations(r.Context(), unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone)
	if err != nil {
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "forbidden service zone") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "service zone not under subdivision") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetSurveyScores godoc
// @ID           getUnitStatisticsSurveyScores
// @Summary      Guest survey score timeseries (live from responses; hourly for a single day, daily for longer ranges)
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        surveyId query string false "Single survey definition id (required with questionIds)"
// @Param        questionIds query []string false "Question ids (repeat param or comma-separated); native scale"
// @Success      200 {object} services.SurveyScoresResponse
// @Router       /units/{unitId}/statistics/survey-scores [get]
func (h *StatisticsHandler) GetSurveyScores(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if !repository.UserCanViewSurveyScoreAggregates(user, unitID) {
		http.Error(w, "survey score statistics access required", http.StatusForbidden)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required", http.StatusBadRequest)
		return
	}
	var surveyID *string
	if v := strings.TrimSpace(r.URL.Query().Get("surveyId")); v != "" {
		surveyID = &v
	}
	qids := parseStatisticsQuestionIDs(r.URL.Query())
	resp, err := h.service.GetSurveyScores(r.Context(), unitID, companyID, user, viewerID, dateFrom, dateTo, surveyID, qids)
	if err != nil {
		if strings.Contains(err.Error(), "surveyId is required") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "invalid date") || strings.Contains(err.Error(), "dateTo before") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetLoad godoc
// @ID           getUnitStatisticsLoad
// @Summary      Daily ticket load (created / completed / no-show)
// @Description  Same daily bucket source as timeseries volume; wait/service semantics match timeseries when those metrics are derived from the same warehouse rows.
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        userId query string false "Filter by operator (expanded scope only)"
// @Param        serviceZoneId query string false "Service zone unit id"
// @Success      200 {object} services.LoadResponse
// @Router       /units/{unitId}/statistics/load [get]
func (h *StatisticsHandler) GetLoad(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required", http.StatusBadRequest)
		return
	}
	var reqUser *string
	if v := strings.TrimSpace(r.URL.Query().Get("userId")); v != "" {
		reqUser = &v
	}
	svcZone := strings.TrimSpace(r.URL.Query().Get("serviceZoneId"))
	resp, err := h.service.GetLoad(r.Context(), unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone)
	if err != nil {
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "forbidden service zone") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "service zone not under subdivision") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetUtilization godoc
// @ID           getUnitStatisticsUtilization
// @Summary      Per-operator utilization (serving vs idle/break), calendar days in subdivision TZ
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        userId query string true "Target operator user id"
// @Success      200 {object} services.UtilizationResponse
// @Router       /units/{unitId}/statistics/utilization [get]
func (h *StatisticsHandler) GetUtilization(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	target := strings.TrimSpace(r.URL.Query().Get("userId"))
	if target == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required", http.StatusBadRequest)
		return
	}
	resp, err := h.service.GetUtilization(r.Context(), unitID, companyID, user, viewerID, target, dateFrom, dateTo)
	if err != nil {
		if err.Error() == "forbidden" {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "invalid date") || strings.Contains(err.Error(), "dateTo before") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetTicketsByService godoc
// @ID           getUnitStatisticsTicketsByService
// @Summary      Tickets created in range grouped by business service (donut chart)
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        userId query string false "Filter by operator (expanded scope only)"
// @Param        serviceZoneId query string false "Service zone unit id"
// @Success      200 {object} services.TicketsByServiceResponse
// @Router       /units/{unitId}/statistics/tickets-by-service [get]
func (h *StatisticsHandler) GetTicketsByService(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required", http.StatusBadRequest)
		return
	}
	var reqUser *string
	if v := strings.TrimSpace(r.URL.Query().Get("userId")); v != "" {
		reqUser = &v
	}
	svcZone := strings.TrimSpace(r.URL.Query().Get("serviceZoneId"))
	resp, err := h.service.GetTicketsByService(r.Context(), unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone)
	if err != nil {
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "forbidden service zone") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "service zone not under subdivision") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "invalid date") || strings.Contains(err.Error(), "dateTo before") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetSlaSummary godoc
// @ID           getUnitStatisticsSlaSummary
// @Summary      Aggregate waiting SLA percent for date range (optional service filter)
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        dateFrom query string true "YYYY-MM-DD"
// @Param        dateTo query string true "YYYY-MM-DD"
// @Param        userId query string false "Filter by operator (expanded scope only)"
// @Param        serviceZoneId query string false "Service zone unit id"
// @Param        serviceId query string false "Business service id; omit for all services in scope"
// @Success      200 {object} services.SlaSummaryResponse
// @Router       /units/{unitId}/statistics/sla-summary [get]
func (h *StatisticsHandler) GetSlaSummary(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	dateFrom := strings.TrimSpace(r.URL.Query().Get("dateFrom"))
	dateTo := strings.TrimSpace(r.URL.Query().Get("dateTo"))
	if dateFrom == "" || dateTo == "" {
		http.Error(w, "dateFrom and dateTo are required", http.StatusBadRequest)
		return
	}
	var reqUser *string
	if v := strings.TrimSpace(r.URL.Query().Get("userId")); v != "" {
		reqUser = &v
	}
	svcZone := strings.TrimSpace(r.URL.Query().Get("serviceZoneId"))
	filterSvc := strings.TrimSpace(r.URL.Query().Get("serviceId"))
	resp, err := h.service.GetSlaSummary(r.Context(), unitID, companyID, user, viewerID, dateFrom, dateTo, reqUser, svcZone, filterSvc)
	if err != nil {
		if err.Error() == "service not found under subdivision" {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "forbidden service zone") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "service zone not under subdivision") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "invalid date") || strings.Contains(err.Error(), "dateTo before") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}

// GetEmployeeRadar godoc
// @ID           getUnitStatisticsEmployeeRadar
// @Summary      Employee radar chart metrics
// @Tags         statistics
// @Security     BearerAuth
// @Param        unitId path string true "Subdivision unit ID"
// @Param        userId query string true "Target user id"
// @Success      200 {object} services.EmployeeRadarResponse
// @Router       /units/{unitId}/statistics/employee-radar [get]
func (h *StatisticsHandler) GetEmployeeRadar(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "unitId")
	viewerID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.userRepo.FindByID(viewerID)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	target := strings.TrimSpace(r.URL.Query().Get("userId"))
	if target == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}
	companyID, err := h.subdivisionCompanyID(r.Context(), unitID)
	if err != nil {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	resp, err := h.service.GetEmployeeRadar(r.Context(), unitID, companyID, user, viewerID, target)
	if err != nil {
		if err.Error() == "forbidden" {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "plan does not include") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	RespondJSON(w, resp)
}
