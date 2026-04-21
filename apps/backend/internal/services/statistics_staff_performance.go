package services

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/statistics"
)

// StaffPerformanceResponse is a per-operator performance summary for the staff leaderboard and detail card.
type StaffPerformanceResponse struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`

	// Normalized radar axes (0–100)
	SlaWait        float64 `json:"slaWait"`
	SlaService     float64 `json:"slaService"`
	TicketsPerHour float64 `json:"ticketsPerHour"`
	UtilizationPct float64 `json:"utilizationPct"`
	CsatNorm       float64 `json:"csatNorm"` // 0–100, derived from csatAvg

	// Absolute metrics
	TicketsCompleted int     `json:"ticketsCompleted"`
	TicketsCreated   int     `json:"ticketsCreated"`
	NoShowCount      int     `json:"noShowCount"`
	AvgWaitMs        int64   `json:"avgWaitMs"`
	AvgServiceMs     int64   `json:"avgServiceMs"`
	SlaWaitMet       int     `json:"slaWaitMet"`
	SlaWaitTotal     int     `json:"slaWaitTotal"`
	SlaServiceMet    int     `json:"slaServiceMet"`
	SlaServiceTotal  int     `json:"slaServiceTotal"`
	TotalBreakMin    float64 `json:"totalBreakMin"`
	TotalIdleMin     float64 `json:"totalIdleMin"`
	TotalServiceMin  float64 `json:"totalServiceMin"`

	// CSAT
	CsatAvg   *float64 `json:"csatAvg,omitempty"`
	CsatCount int      `json:"csatCount"`

	// Daily trend (only populated in detail mode)
	DailyTrend []StaffDailyTrendPoint `json:"dailyTrend,omitempty"`

	ComputedAt *time.Time `json:"computedAt,omitempty"`
}

// StaffDailyTrendPoint is one day's data for an operator's performance trend.
type StaffDailyTrendPoint struct {
	Date             string  `json:"date"`
	TicketsCompleted int     `json:"ticketsCompleted"`
	SlaWaitPct       float64 `json:"slaWaitPct"`
	SlaServicePct    float64 `json:"slaServicePct"`
	AvgServiceMs     int64   `json:"avgServiceMs"`
}

// StaffPerformanceListResponse wraps the leaderboard list.
type StaffPerformanceListResponse struct {
	Items []StaffPerformanceResponse `json:"items"`
}

// operatorActorRow is a distinct ActorUserID from statistics_daily_buckets.
type operatorActorRow struct {
	ActorUserID string `gorm:"column:actor_user_id"`
}

// GetStaffPerformanceList returns performance metrics for all operators (expanded scope) or only the
// caller (non-expanded scope). Requires the advanced_reports plan feature.
func (s *StatisticsService) GetStaffPerformanceList(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	sortBy string,
	sortOrder string,
) (*StaffPerformanceListResponse, error) {
	return s.staffPerformance(ctx, subdivisionID, companyID, user, viewerID, dateFrom, dateTo, nil, sortBy, sortOrder, false)
}

// GetStaffPerformanceDetail returns a detailed performance profile for a single operator.
// Requires the advanced_reports plan feature.
func (s *StatisticsService) GetStaffPerformanceDetail(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	targetUserID string,
	dateFrom, dateTo string,
) (*StaffPerformanceResponse, error) {
	resp, err := s.staffPerformance(ctx, subdivisionID, companyID, user, viewerID, dateFrom, dateTo, &targetUserID, "", "", true)
	if err != nil {
		return nil, err
	}
	if len(resp.Items) == 0 {
		return &StaffPerformanceResponse{UserID: targetUserID}, nil
	}
	return &resp.Items[0], nil
}

// staffPerformance is the shared implementation for list and detail.
func (s *StatisticsService) staffPerformance(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	singleUserID *string,
	sortBy string,
	sortOrder string,
	includeDailyTrend bool,
) (*StaffPerformanceListResponse, error) {
	ok, err := CompanyAllowsAdvancedReports(ctx, s.db, companyID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("plan does not include advanced reports")
	}

	branchIDs, err := s.statisticsBranchUnitIDs(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}

	sc := statistics.ResolveScope(user, subdivisionID, viewerID, branchIDs)
	if sc.Denied {
		return nil, errors.New("forbidden")
	}

	// Determine which user IDs to report on.
	var targetIDs []string
	if singleUserID != nil {
		uid := strings.TrimSpace(*singleUserID)
		if !sc.Expanded && strings.TrimSpace(sc.ForceUserID) != uid {
			return nil, errors.New("forbidden")
		}
		targetIDs = []string{uid}
	} else {
		if sc.Expanded {
			// List all operators who have statistics data in this period.
			var actors []operatorActorRow
			if qErr := s.db.WithContext(ctx).Raw(`
SELECT DISTINCT actor_user_id::text AS actor_user_id
FROM statistics_daily_buckets
WHERE unit_id::text = ?
  AND bucket_date >= ? AND bucket_date <= ?
  AND actor_user_id::text != ?
  AND service_zone_id::text = ?
ORDER BY actor_user_id
`, subdivisionID, dateFrom, dateTo, repository.StatisticsUnitAggregateActor(), repository.StatisticsWholeSubdivisionServiceZoneID()).
				Scan(&actors).Error; qErr != nil {
				return nil, qErr
			}
			for _, a := range actors {
				if strings.TrimSpace(a.ActorUserID) != "" {
					targetIDs = append(targetIDs, a.ActorUserID)
				}
			}
		} else {
			forceUID := strings.TrimSpace(sc.ForceUserID)
			if forceUID == "" {
				return &StaffPerformanceListResponse{Items: []StaffPerformanceResponse{}}, nil
			}
			targetIDs = []string{forceUID}
		}
	}

	if len(targetIDs) == 0 {
		return &StaffPerformanceListResponse{Items: []StaffPerformanceResponse{}}, nil
	}

	// Resolve user display names.
	nameMap, err := s.resolveUserDisplayNames(ctx, targetIDs)
	if err != nil {
		nameMap = map[string]string{}
	}

	// Parse date range for UTC bounds.
	loc := time.UTC
	if tzName, tzErr := s.loadSubdivisionTimezoneName(ctx, subdivisionID); tzErr == nil {
		if l, lErr := time.LoadLocation(tzName); lErr == nil && l != nil {
			loc = l
		}
	}
	startUTC, endUTC, dateErr := staffParseDateRangeToUTC(dateFrom, dateTo, loc)
	if dateErr != nil {
		return nil, dateErr
	}

	// Fetch idle/break totals for all operators in one query.
	type intervalBatchRow struct {
		UserID        string  `gorm:"column:user_id"`
		TotalBreakMin float64 `gorm:"column:total_break_min"`
		TotalIdleMin  float64 `gorm:"column:total_idle_min"`
	}
	var intervalBatch []intervalBatchRow
	_ = s.db.WithContext(ctx).Raw(`
SELECT
  user_id::text AS user_id,
  SUM(CASE WHEN kind = 'break' THEN
    EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60.0
    ELSE 0 END) AS total_break_min,
  SUM(CASE WHEN kind = 'idle' THEN
    EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60.0
    ELSE 0 END) AS total_idle_min
FROM counter_operator_intervals
WHERE unit_id::text = ?
  AND user_id::text IN (?)
  AND kind IN ('break', 'idle')
  AND started_at < ?::timestamptz
  AND COALESCE(ended_at, NOW()) > ?::timestamptz
GROUP BY user_id
`, subdivisionID, targetIDs, endUTC, startUTC).Scan(&intervalBatch).Error
	intervalByUser := make(map[string]intervalBatchRow, len(intervalBatch))
	for _, r := range intervalBatch {
		intervalByUser[r.UserID] = r
	}

	// Fetch service minutes from tickets via served_by_user_id.
	type serviceMinRow struct {
		UserID          string  `gorm:"column:user_id"`
		TotalServiceMin float64 `gorm:"column:total_service_min"`
	}
	var serviceBatch []serviceMinRow
	_ = s.db.WithContext(ctx).Raw(`
SELECT
  served_by_user_id::text AS user_id,
  SUM(EXTRACT(EPOCH FROM (completed_at - confirmed_at)) / 60.0) AS total_service_min
FROM tickets
WHERE unit_id::text = ?
  AND served_by_user_id::text IN (?)
  AND confirmed_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND completed_at >= ?::timestamptz
  AND completed_at < ?::timestamptz
  AND status IN ('served', 'no_show')
GROUP BY served_by_user_id
`, subdivisionID, targetIDs, startUTC, endUTC).Scan(&serviceBatch).Error
	serviceByUser := make(map[string]float64, len(serviceBatch))
	for _, r := range serviceBatch {
		serviceByUser[r.UserID] = r.TotalServiceMin
	}

	// CSAT per operator (MVP): use subdivision-wide CSAT from StatisticsSurveyDaily.
	// Per-operator CSAT requires normalization of raw survey_responses.answers which depends on
	// survey definition question min/max values; the subdivision-wide signal is used as an approximation.
	// Future: per-operator CSAT via served_by_user_id + in-Go normalization.
	surveyRows, _ := s.statsRepo.ListSurveyDaily(subdivisionID, dateFrom, dateTo)
	var subdivCsatAvg *float64
	var subdivCsatCount int
	{
		agg := repository.StatisticsSurveyAggregateSurveyID()
		var sum float64
		var n int
		for _, r := range surveyRows {
			if r.SurveyDefinitionID == agg && r.QuestionKey == "" && r.CountNorm5 > 0 {
				sum += r.SumNorm5
				n += r.CountNorm5
			}
		}
		if n > 0 {
			avg := sum / float64(n)
			subdivCsatAvg = &avg
			subdivCsatCount = n
		}
	}

	// Days-inclusive for TicketsPerHour denominator.
	df, _ := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateFrom), loc)
	dt, _ := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateTo), loc)
	daysInclusive := int(dt.Sub(df).Hours()/24) + 1
	if daysInclusive < 1 {
		daysInclusive = 1
	}
	const workHoursPerDay = 8.0

	computedAt, _ := s.operationalStatisticsAsOf(subdivisionID)

	out := make([]StaffPerformanceResponse, 0, len(targetIDs))

	for _, uid := range targetIDs {
		rows, bErr := s.statsRepo.ListDailyBuckets(subdivisionID, dateFrom, dateTo, &uid,
			repository.StatisticsZoneQuery{WholeSubdivision: true})
		if bErr != nil {
			continue
		}

		var (
			waitSum    int64
			waitCount  int
			servSum    int64
			servCount  int
			completed  int
			created    int
			noShow     int
			slaWaitMet int
			slaWaitTot int
			slaSvcMet  int
			slaSvcTot  int
		)
		var trend []StaffDailyTrendPoint
		for _, r := range rows {
			waitSum += r.WaitSumMs
			waitCount += r.WaitCount
			servSum += r.ServiceSumMs
			servCount += r.ServiceCount
			completed += r.TicketsCompleted
			created += r.TicketsCreated
			noShow += r.NoShowCount
			slaWaitMet += r.SlaWaitMet
			slaWaitTot += r.SlaWaitTotal
			slaSvcMet += r.SlaServiceMet
			slaSvcTot += r.SlaServiceTotal

			if includeDailyTrend {
				pt := StaffDailyTrendPoint{
					Date:             r.BucketDate,
					TicketsCompleted: r.TicketsCompleted,
				}
				if r.SlaWaitTotal > 0 {
					pt.SlaWaitPct = 100.0 * float64(r.SlaWaitMet) / float64(r.SlaWaitTotal)
				} else {
					pt.SlaWaitPct = 100
				}
				if r.SlaServiceTotal > 0 {
					pt.SlaServicePct = 100.0 * float64(r.SlaServiceMet) / float64(r.SlaServiceTotal)
				} else {
					pt.SlaServicePct = 100
				}
				if r.ServiceCount > 0 {
					pt.AvgServiceMs = r.ServiceSumMs / int64(r.ServiceCount)
				}
				trend = append(trend, pt)
			}
		}

		var slaWaitPct float64 = 100
		if slaWaitTot > 0 {
			slaWaitPct = 100.0 * float64(slaWaitMet) / float64(slaWaitTot)
		}
		var slaSvcPct float64 = 100
		if slaSvcTot > 0 {
			slaSvcPct = 100.0 * float64(slaSvcMet) / float64(slaSvcTot)
		}

		var avgWaitMs int64
		if waitCount > 0 {
			avgWaitMs = waitSum / int64(waitCount)
		}
		var avgServiceMs int64
		if servCount > 0 {
			avgServiceMs = servSum / int64(servCount)
		}

		var tph float64
		if completed > 0 {
			tph = float64(completed) / (float64(daysInclusive) * workHoursPerDay)
		}

		iv := intervalByUser[uid]
		svcMin := serviceByUser[uid]
		var utilPct float64
		totalActive := iv.TotalIdleMin + svcMin
		if totalActive > 0 {
			utilPct = 100.0 * svcMin / totalActive
		}

		// Use subdivision-wide CSAT (MVP approximation).
		csatAvg := subdivCsatAvg
		csatCount := subdivCsatCount
		var csatNorm float64
		if csatAvg != nil {
			csatNorm = (*csatAvg - 1) / 4 * 100
			if csatNorm < 0 {
				csatNorm = 0
			}
			if csatNorm > 100 {
				csatNorm = 100
			}
		}

		resp := StaffPerformanceResponse{
			UserID:           uid,
			UserName:         nameMap[uid],
			SlaWait:          slaWaitPct,
			SlaService:       slaSvcPct,
			TicketsPerHour:   tph,
			UtilizationPct:   utilPct,
			CsatNorm:         csatNorm,
			TicketsCompleted: completed,
			TicketsCreated:   created,
			NoShowCount:      noShow,
			AvgWaitMs:        avgWaitMs,
			AvgServiceMs:     avgServiceMs,
			SlaWaitMet:       slaWaitMet,
			SlaWaitTotal:     slaWaitTot,
			SlaServiceMet:    slaSvcMet,
			SlaServiceTotal:  slaSvcTot,
			TotalBreakMin:    iv.TotalBreakMin,
			TotalIdleMin:     iv.TotalIdleMin,
			TotalServiceMin:  svcMin,
			CsatAvg:          csatAvg,
			CsatCount:        csatCount,
			DailyTrend:       trend,
			ComputedAt:       computedAt,
		}
		if resp.UserName == "" {
			resp.UserName = uid
		}
		out = append(out, resp)
	}

	applyStaffSort(out, sortBy, sortOrder)

	return &StaffPerformanceListResponse{Items: out}, nil
}

// applyStaffSort sorts the leaderboard by the requested field.
func applyStaffSort(items []StaffPerformanceResponse, sortBy, sortOrder string) {
	if sortBy == "" {
		sortBy = "ticketsCompleted"
	}
	desc := strings.ToLower(strings.TrimSpace(sortOrder)) != "asc"

	sort.Slice(items, func(i, j int) bool {
		a, b := items[i], items[j]
		var less bool
		switch sortBy {
		case "avgServiceMs":
			less = a.AvgServiceMs < b.AvgServiceMs
		case "slaWait":
			less = a.SlaWait < b.SlaWait
		case "csatAvg":
			ai, bi := 0.0, 0.0
			if a.CsatAvg != nil {
				ai = *a.CsatAvg
			}
			if b.CsatAvg != nil {
				bi = *b.CsatAvg
			}
			less = ai < bi
		case "utilizationPct":
			less = a.UtilizationPct < b.UtilizationPct
		default: // ticketsCompleted
			less = a.TicketsCompleted < b.TicketsCompleted
		}
		if desc {
			return !less
		}
		return less
	})
}

// resolveUserDisplayNames returns a map of userID → display name.
func (s *StatisticsService) resolveUserDisplayNames(ctx context.Context, userIDs []string) (map[string]string, error) {
	if len(userIDs) == 0 {
		return map[string]string{}, nil
	}
	type nameRow struct {
		ID    string  `gorm:"column:id"`
		Name  string  `gorm:"column:name"`
		Email *string `gorm:"column:email"`
	}
	var rows []nameRow
	if err := s.db.WithContext(ctx).Raw(
		`SELECT id::text AS id, COALESCE(name, '') AS name, email FROM users WHERE id::text IN (?)`, userIDs,
	).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		label := strings.TrimSpace(r.Name)
		if label == "" && r.Email != nil {
			label = strings.TrimSpace(*r.Email)
		}
		if label != "" {
			out[r.ID] = label
		}
	}
	return out, nil
}

// staffParseDateRangeToUTC converts YYYY-MM-DD date strings to UTC time bounds.
func staffParseDateRangeToUTC(dateFrom, dateTo string, loc *time.Location) (startUTC, endUTC time.Time, err error) {
	df, dErr := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateFrom), loc)
	if dErr != nil {
		return time.Time{}, time.Time{}, errors.New("invalid dateFrom")
	}
	dt, dErr := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateTo), loc)
	if dErr != nil {
		return time.Time{}, time.Time{}, errors.New("invalid dateTo")
	}
	startUTC = time.Date(df.Year(), df.Month(), df.Day(), 0, 0, 0, 0, loc).UTC()
	endUTC = time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1).UTC()
	return startUTC, endUTC, nil
}
