package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/statistics"
)

// TicketsByServiceItem is one slice of the donut chart (tickets created in range, grouped by service).
type TicketsByServiceItem struct {
	ServiceID   string `json:"serviceId"`
	ServiceName string `json:"serviceName"`
	Count       int    `json:"count"`
}

// TicketsByServiceResponse is GET .../statistics/tickets-by-service.
type TicketsByServiceResponse struct {
	Items      []TicketsByServiceItem `json:"items"`
	Total      int                    `json:"total"`
	ComputedAt *time.Time             `json:"computedAt,omitempty"`
}

// SlaSummaryResponse is GET .../statistics/sla-summary (waiting and service-time SLA, share in percent).
type SlaSummaryResponse struct {
	WithinPct       float64    `json:"withinPct"`
	BreachPct       float64    `json:"breachPct"`
	SlaWaitMet      int        `json:"slaWaitMet"`
	SlaWaitTotal    int        `json:"slaWaitTotal"`
	SlaServiceMet   int        `json:"slaServiceMet"`
	SlaServiceTotal int        `json:"slaServiceTotal"`
	ServiceID       *string    `json:"serviceId,omitempty"`
	ComputedAt      *time.Time `json:"computedAt,omitempty"`
}

func (s *StatisticsService) statisticsSubdivisionDateRangeUTC(
	ctx context.Context,
	subdivisionID, dateFrom, dateTo string,
) (startUTC, endUTC time.Time, err error) {
	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	df, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateFrom), loc)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("invalid dateFrom")
	}
	dt, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateTo), loc)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("invalid dateTo")
	}
	if dt.Before(df) {
		return time.Time{}, time.Time{}, errors.New("dateTo before dateFrom")
	}
	startUTC = time.Date(df.Year(), df.Month(), df.Day(), 0, 0, 0, 0, loc).UTC()
	endUTC = time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1).UTC()
	return startUTC, endUTC, nil
}

func appendTouchedTicketsFilter(
	sb *strings.Builder,
	args *[]interface{},
	subdivisionID, userID string,
	startUTC, endUTC time.Time,
) {
	sb.WriteString(`
  AND t.id::text IN (
    SELECT DISTINCT h.ticket_id::text
    FROM ticket_histories h
    INNER JOIN tickets t2 ON t2.id = h.ticket_id
    WHERE t2.unit_id::text = ?
      AND h.user_id::text = ?
      AND h.created_at >= ? AND h.created_at < ?
  )`)
	*args = append(*args, subdivisionID, userID, startUTC, endUTC)
}

type ticketsByServiceScanRow struct {
	ServiceID   string `gorm:"column:service_id"`
	ServiceName string `gorm:"column:service_name"`
	Count       int    `gorm:"column:cnt"`
}

type slaSummaryScanRow struct {
	Met   int `gorm:"column:met"`
	Total int `gorm:"column:tot"`
}

// GetTicketsByService returns counts of tickets created in [dateFrom, dateTo] by service_id (same zone / operator rules as other statistics).
func (s *StatisticsService) GetTicketsByService(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	requestedUserID *string,
	requestedServiceZoneID string,
) (*TicketsByServiceResponse, error) {
	ok, err := CompanyAllowsBasicReports(ctx, s.db, companyID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("plan does not include basic reports")
	}
	branchIDs, err := s.statisticsBranchUnitIDs(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	sc := statistics.ResolveScope(user, subdivisionID, viewerID, branchIDs)
	if sc.Denied {
		return nil, errors.New("forbidden")
	}
	effectiveUser := sc.ApplyRequestedUserID(requestedUserID)
	if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" && strings.TrimSpace(requestedServiceZoneID) != "" {
		return nil, errors.New("serviceZoneId cannot be used with userId filter")
	}
	zq, err := statistics.ResolveDailyBucketZoneQuery(s.db, subdivisionID, sc, requestedServiceZoneID)
	if err != nil {
		return nil, err
	}
	startUTC, endUTC, err := s.statisticsSubdivisionDateRangeUTC(ctx, subdivisionID, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}

	var sb strings.Builder
	var args []interface{}
	sb.WriteString(`
SELECT t.service_id::text AS service_id,
  MAX(COALESCE(NULLIF(TRIM(s.name), ''), t.service_id::text)) AS service_name,
  COUNT(*)::int AS cnt
FROM tickets t
LEFT JOIN services s ON s.id::text = t.service_id::text AND s.unit_id::text = t.unit_id::text
WHERE t.unit_id::text = ?
  AND t.created_at >= ? AND t.created_at < ?
`)
	args = append(args, subdivisionID, startUTC, endUTC)
	appendTicketZoneFilter(&sb, &args, zq)
	if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" {
		appendTouchedTicketsFilter(&sb, &args, subdivisionID, strings.TrimSpace(*effectiveUser), startUTC, endUTC)
	}
	sb.WriteString(`
GROUP BY t.service_id::text
ORDER BY cnt DESC
`)

	var rows []ticketsByServiceScanRow
	if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := &TicketsByServiceResponse{Items: make([]TicketsByServiceItem, 0, len(rows))}
	for _, r := range rows {
		nm := strings.TrimSpace(r.ServiceName)
		if nm == "" {
			nm = r.ServiceID
		}
		out.Items = append(out.Items, TicketsByServiceItem{
			ServiceID:   r.ServiceID,
			ServiceName: nm,
			Count:       r.Count,
		})
		out.Total += r.Count
	}
	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	out.ComputedAt = computedAt
	return out, nil
}

// GetSlaSummary returns aggregate waiting SLA met/total for the date range (optional filter by business service).
func (s *StatisticsService) GetSlaSummary(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	requestedUserID *string,
	requestedServiceZoneID string,
	filterServiceID string,
) (*SlaSummaryResponse, error) {
	ok, err := CompanyAllowsBasicReports(ctx, s.db, companyID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("plan does not include basic reports")
	}
	branchIDs, err := s.statisticsBranchUnitIDs(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	sc := statistics.ResolveScope(user, subdivisionID, viewerID, branchIDs)
	if sc.Denied {
		return nil, errors.New("forbidden")
	}
	effectiveUser := sc.ApplyRequestedUserID(requestedUserID)
	if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" && strings.TrimSpace(requestedServiceZoneID) != "" {
		return nil, errors.New("serviceZoneId cannot be used with userId filter")
	}
	zq, err := statistics.ResolveDailyBucketZoneQuery(s.db, subdivisionID, sc, requestedServiceZoneID)
	if err != nil {
		return nil, err
	}
	startUTC, endUTC, err := s.statisticsSubdivisionDateRangeUTC(ctx, subdivisionID, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}

	svcTrim := strings.TrimSpace(filterServiceID)
	if svcTrim != "" {
		var cnt int64
		if err := s.db.WithContext(ctx).Raw(`
SELECT COUNT(*) FROM services WHERE id::text = ? AND unit_id::text = ?
`, svcTrim, subdivisionID).Scan(&cnt).Error; err != nil {
			return nil, err
		}
		if cnt == 0 {
			return nil, errors.New("service not found under subdivision")
		}
	}

	var sb strings.Builder
	var args []interface{}
	sb.WriteString(`
SELECT
  COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (t.called_at - t.created_at)) <= t.max_waiting_time)::int AS met,
  COUNT(*)::int AS tot
FROM tickets t
WHERE t.unit_id::text = ?
  AND t.called_at IS NOT NULL
  AND t.called_at >= ? AND t.called_at < ?
  AND t.max_waiting_time IS NOT NULL
`)
	args = append(args, subdivisionID, startUTC, endUTC)
	appendTicketZoneFilter(&sb, &args, zq)
	if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" {
		appendTouchedTicketsFilter(&sb, &args, subdivisionID, strings.TrimSpace(*effectiveUser), startUTC, endUTC)
	}
	if svcTrim != "" {
		sb.WriteString(` AND t.service_id::text = ?`)
		args = append(args, svcTrim)
	}

	var row slaSummaryScanRow
	if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&row).Error; err != nil {
		return nil, err
	}

	// Service-time SLA: tickets in 'served' status, completed in range, with max_service_time set.
	var svcArgs []interface{}
	var svcSb strings.Builder
	svcSb.WriteString(`
SELECT
  COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (t.completed_at - t.confirmed_at)) <= t.max_service_time)::int AS met,
  COUNT(*)::int AS tot
FROM tickets t
WHERE t.unit_id::text = ?
  AND t.status = 'served'
  AND t.confirmed_at IS NOT NULL
  AND t.completed_at IS NOT NULL
  AND t.completed_at >= ? AND t.completed_at < ?
  AND t.max_service_time IS NOT NULL AND t.max_service_time > 0
`)
	svcArgs = append(svcArgs, subdivisionID, startUTC, endUTC)
	appendTicketZoneFilter(&svcSb, &svcArgs, zq)
	if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" {
		appendTouchedTicketsFilter(&svcSb, &svcArgs, subdivisionID, strings.TrimSpace(*effectiveUser), startUTC, endUTC)
	}
	if svcTrim != "" {
		svcSb.WriteString(` AND t.service_id::text = ?`)
		svcArgs = append(svcArgs, svcTrim)
	}

	var svcRow slaSummaryScanRow
	if err := s.db.WithContext(ctx).Raw(svcSb.String(), svcArgs...).Scan(&svcRow).Error; err != nil {
		return nil, err
	}

	out := &SlaSummaryResponse{
		SlaWaitMet:      row.Met,
		SlaWaitTotal:    row.Total,
		SlaServiceMet:   svcRow.Met,
		SlaServiceTotal: svcRow.Total,
	}
	if svcTrim != "" {
		out.ServiceID = &svcTrim
	}
	if row.Total <= 0 {
		out.WithinPct = 0
		out.BreachPct = 0
	} else {
		out.WithinPct = 100.0 * float64(row.Met) / float64(row.Total)
		out.BreachPct = 100.0 - out.WithinPct
	}
	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	out.ComputedAt = computedAt
	return out, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA Heatmap
// ─────────────────────────────────────────────────────────────────────────────

// SLAHeatmapCell is one (day, hour) bucket in the heatmap grid.
type SLAHeatmapCell struct {
	Date  string  `json:"date"` // "YYYY-MM-DD"
	Hour  int     `json:"hour"` // 0–23
	Met   int     `json:"met"`
	Total int     `json:"total"`
	Pct   float64 `json:"pct"` // 0–100; 0 when total == 0
}

// SLAHeatmapResponse is GET .../statistics/sla-heatmap.
type SLAHeatmapResponse struct {
	Type       string           `json:"type"` // "wait" | "service"
	Cells      []SLAHeatmapCell `json:"cells"`
	ComputedAt *time.Time       `json:"computedAt,omitempty"`
}

type slaHeatmapScanRow struct {
	Day   string `gorm:"column:day"`
	Hr    int    `gorm:"column:hr"`
	Met   int    `gorm:"column:met"`
	Total int    `gorm:"column:total"`
}

// GetSLAHeatmap returns per-hour SLA compliance for each day in the range.
// slaType must be "wait" or "service". Only cells where total > 0 are returned.
func (s *StatisticsService) GetSLAHeatmap(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	slaType string,
	requestedUserID *string,
	requestedServiceZoneID string,
) (*SLAHeatmapResponse, error) {
	ok, err := CompanyAllowsBasicReports(ctx, s.db, companyID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("plan does not include basic reports")
	}
	if slaType != "wait" && slaType != "service" {
		return nil, errors.New("type must be 'wait' or 'service'")
	}
	branchIDs, err := s.statisticsBranchUnitIDs(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	sc := statistics.ResolveScope(user, subdivisionID, viewerID, branchIDs)
	if sc.Denied {
		return nil, errors.New("forbidden")
	}
	effectiveUser := sc.ApplyRequestedUserID(requestedUserID)
	if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" && strings.TrimSpace(requestedServiceZoneID) != "" {
		return nil, errors.New("serviceZoneId cannot be used with userId filter")
	}
	zq, err := statistics.ResolveDailyBucketZoneQuery(s.db, subdivisionID, sc, requestedServiceZoneID)
	if err != nil {
		return nil, err
	}
	startUTC, endUTC, err := s.statisticsSubdivisionDateRangeUTC(ctx, subdivisionID, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}

	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	// Validate tzName against the IANA timezone database to prevent SQL injection.
	if _, tzErr := time.LoadLocation(tzName); tzErr != nil {
		tzName = "UTC"
	}

	var rows []slaHeatmapScanRow

	if slaType == "wait" {
		var sb strings.Builder
		var args []interface{}
		sb.WriteString(`
SELECT
  timezone(?, t.called_at)::date::text AS day,
  EXTRACT(HOUR FROM timezone(?, t.called_at))::int AS hr,
  COUNT(*) FILTER (
    WHERE EXTRACT(EPOCH FROM (t.called_at - t.created_at)) <= t.max_waiting_time
  )::int AS met,
  COUNT(*)::int AS total
FROM tickets t
WHERE t.unit_id::text = ?
  AND t.called_at >= ? AND t.called_at < ?
  AND t.max_waiting_time IS NOT NULL AND t.max_waiting_time > 0
`)
		args = append(args, tzName, tzName, subdivisionID, startUTC, endUTC)
		appendTicketZoneFilter(&sb, &args, zq)
		if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" {
			appendTouchedTicketsFilter(&sb, &args, subdivisionID, strings.TrimSpace(*effectiveUser), startUTC, endUTC)
		}
		sb.WriteString("\nGROUP BY 1, 2\nORDER BY 1, 2\n")
		if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&rows).Error; err != nil {
			return nil, err
		}
	} else {
		var sb strings.Builder
		var args []interface{}
		sb.WriteString(`
SELECT
  timezone(?, t.completed_at)::date::text AS day,
  EXTRACT(HOUR FROM timezone(?, t.completed_at))::int AS hr,
  COUNT(*) FILTER (
    WHERE EXTRACT(EPOCH FROM (t.completed_at - t.confirmed_at)) <= t.max_service_time
  )::int AS met,
  COUNT(*)::int AS total
FROM tickets t
WHERE t.unit_id::text = ?
  AND t.status = 'served'
  AND t.confirmed_at IS NOT NULL
  AND t.completed_at >= ? AND t.completed_at < ?
  AND t.max_service_time IS NOT NULL AND t.max_service_time > 0
`)
		args = append(args, tzName, tzName, subdivisionID, startUTC, endUTC)
		appendTicketZoneFilter(&sb, &args, zq)
		if effectiveUser != nil && strings.TrimSpace(*effectiveUser) != "" {
			appendTouchedTicketsFilter(&sb, &args, subdivisionID, strings.TrimSpace(*effectiveUser), startUTC, endUTC)
		}
		sb.WriteString("\nGROUP BY 1, 2\nORDER BY 1, 2\n")
		if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&rows).Error; err != nil {
			return nil, err
		}
	}

	cells := make([]SLAHeatmapCell, 0, len(rows))
	for _, r := range rows {
		if r.Total <= 0 {
			continue
		}
		pct := 100.0 * float64(r.Met) / float64(r.Total)
		cells = append(cells, SLAHeatmapCell{
			Date:  r.Day,
			Hour:  r.Hr,
			Met:   r.Met,
			Total: r.Total,
			Pct:   pct,
		})
	}

	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	return &SLAHeatmapResponse{
		Type:       slaType,
		Cells:      cells,
		ComputedAt: computedAt,
	}, nil
}
