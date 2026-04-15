package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/statistics"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type StatisticsService struct {
	db           *gorm.DB
	statsRepo    repository.StatisticsRepository
	opRepo       repository.OperationalStateRepository
	segmentsRepo repository.StatisticsTicketSegmentsRepository
}

func NewStatisticsService(
	statsRepo repository.StatisticsRepository,
	opRepo repository.OperationalStateRepository,
	segmentsRepo repository.StatisticsTicketSegmentsRepository,
) *StatisticsService {
	return &StatisticsService{
		db:           database.DB,
		statsRepo:    statsRepo,
		opRepo:       opRepo,
		segmentsRepo: segmentsRepo,
	}
}

// operationalStatisticsAsOf reads statistics_as_of from unit_operational_states.
// If the table is missing (legacy DB) or Get fails for that reason, returns (nil, nil) so charts still load.
func (s *StatisticsService) operationalStatisticsAsOf(subdivisionID string) (*time.Time, error) {
	st, err := s.opRepo.Get(subdivisionID)
	if err != nil {
		if isMissingDBRelation(err, "unit_operational_states") {
			return nil, nil
		}
		return nil, err
	}
	if st == nil {
		return nil, nil
	}
	return st.StatisticsAsOf, nil
}

func isMissingDBRelation(err error, relation string) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	rel := strings.ToLower(relation)
	return strings.Contains(msg, rel) && strings.Contains(msg, "does not exist")
}

// statisticsBranchUnitIDs returns subdivisionID plus every descendant unit id in the branch (for statistics scope filtering).
func (s *StatisticsService) statisticsBranchUnitIDs(ctx context.Context, subdivisionID string) (map[string]struct{}, error) {
	if strings.TrimSpace(subdivisionID) == "" {
		return map[string]struct{}{}, nil
	}
	var ids []string
	err := s.db.WithContext(ctx).Raw(`
WITH RECURSIVE branch AS (
  SELECT id::text AS id FROM units WHERE id::text = ?
  UNION ALL
  SELECT u.id::text FROM units u INNER JOIN branch b ON u.parent_id::text = b.id
)
SELECT id FROM branch
`, subdivisionID).Scan(&ids).Error
	if err != nil {
		return nil, err
	}
	m := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			m[id] = struct{}{}
		}
	}
	return m, nil
}

// companyPlanFeatureBool resolves subscription_plans.features[featureKey] for a company.
// Returns (true, nil) only when the JSON object is present, unmarshals cleanly, and the key is explicitly boolean true.
// Missing company row, NULL features, absent key, null value, or non-boolean value → (false, nil) or (false, err) on DB/unmarshal errors.
func companyPlanFeatureBool(ctx context.Context, db *gorm.DB, companyID string, featureKey string) (bool, error) {
	if strings.TrimSpace(companyID) == "" {
		return false, nil
	}
	var raw []byte
	if err := db.WithContext(ctx).Raw(`
SELECT sp.features FROM companies c
LEFT JOIN subscriptions s ON s.id = c.subscription_id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE c.id = ? LIMIT 1
`, companyID).Scan(&raw).Error; err != nil {
		return false, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return false, err
	}
	v, ok := m[featureKey]
	if !ok {
		return false, nil
	}
	if v == nil {
		return false, nil
	}
	b, ok := v.(bool)
	if !ok {
		return false, fmt.Errorf("subscription plan features.%s must be a boolean", featureKey)
	}
	return b, nil
}

// CompanyAllowsBasicReports is true only when plan.features.basic_reports is explicitly true.
func CompanyAllowsBasicReports(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	return companyPlanFeatureBool(ctx, db, companyID, "basic_reports")
}

// CompanyAllowsAdvancedReports is true only when plan.features.advanced_reports is explicitly true.
func CompanyAllowsAdvancedReports(ctx context.Context, db *gorm.DB, companyID string) (bool, error) {
	return companyPlanFeatureBool(ctx, db, companyID, "advanced_reports")
}

// TimeseriesPoint is one day in a chart.
type TimeseriesPoint struct {
	Date              string   `json:"date"`
	AvgWaitMinutes    *float64 `json:"avgWaitMinutes,omitempty"`
	AvgServiceMinutes *float64 `json:"avgServiceMinutes,omitempty"`
	TicketsCreated    int      `json:"ticketsCreated"`
	TicketsCompleted  int      `json:"ticketsCompleted"`
	NoShowCount       int      `json:"noShowCount"`
	SlaWaitMetPct     *float64 `json:"slaWaitMetPct,omitempty"`
}

type TimeseriesResponse struct {
	Metric      string            `json:"metric"`
	Points      []TimeseriesPoint `json:"points"`
	ComputedAt  *time.Time        `json:"computedAt,omitempty"`
	Granularity string            `json:"granularity,omitempty"` // "day" | "hour"
}

func (s *StatisticsService) GetTimeseries(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	metric string,
	requestedUserID *string,
	requestedServiceZoneID string,
) (*TimeseriesResponse, error) {
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
	days, err := statisticsDayList(dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	useHourly := len(days) == 1 && effectiveUser == nil

	rows, err := s.statsRepo.ListDailyBuckets(subdivisionID, dateFrom, dateTo, effectiveUser, zq)
	if err != nil {
		return nil, err
	}
	out := &TimeseriesResponse{Metric: metric, Points: make([]TimeseriesPoint, 0, len(rows))}
	if useHourly {
		pts, err := s.buildHourlyTimeseriesPoints(ctx, subdivisionID, dateFrom, zq)
		if err != nil {
			return nil, err
		}
		out.Points = pts
		out.Granularity = "hour"
	} else {
		out.Granularity = "day"
		for _, r := range rows {
			p := TimeseriesPoint{
				Date:             r.BucketDate,
				TicketsCreated:   r.TicketsCreated,
				TicketsCompleted: r.TicketsCompleted,
				NoShowCount:      r.NoShowCount,
			}
			if r.WaitCount > 0 {
				v := float64(r.WaitSumMs) / float64(r.WaitCount) / 60000.0
				p.AvgWaitMinutes = &v
			}
			if r.ServiceCount > 0 {
				v := float64(r.ServiceSumMs) / float64(r.ServiceCount) / 60000.0
				p.AvgServiceMinutes = &v
			}
			if r.SlaWaitTotal > 0 {
				v := 100.0 * float64(r.SlaWaitMet) / float64(r.SlaWaitTotal)
				p.SlaWaitMetPct = &v
			}
			out.Points = append(out.Points, p)
		}
	}
	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	out.ComputedAt = computedAt
	return out, nil
}

// SLADeviationsPoint is daily compliant vs breach share (waiting SLA).
type SLADeviationsPoint struct {
	Date         string  `json:"date"`
	WithinPct    float64 `json:"withinPct"`
	BreachPct    float64 `json:"breachPct"`
	SlaWaitMet   int     `json:"slaWaitMet"`
	SlaWaitTotal int     `json:"slaWaitTotal"`
}

type SLADeviationsResponse struct {
	Points      []SLADeviationsPoint `json:"points"`
	ComputedAt  *time.Time           `json:"computedAt,omitempty"`
	Granularity string               `json:"granularity,omitempty"`
}

func (s *StatisticsService) GetSLADeviations(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	requestedUserID *string,
	requestedServiceZoneID string,
) (*SLADeviationsResponse, error) {
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
	days, err := statisticsDayList(dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	useHourly := len(days) == 1 && effectiveUser == nil

	rows, err := s.statsRepo.ListDailyBuckets(subdivisionID, dateFrom, dateTo, effectiveUser, zq)
	if err != nil {
		return nil, err
	}
	out := &SLADeviationsResponse{}
	if useHourly {
		pts, err := s.buildHourlySLADeviationPoints(ctx, subdivisionID, dateFrom, zq)
		if err != nil {
			return nil, err
		}
		out.Points = pts
		out.Granularity = "hour"
	} else {
		out.Points = make([]SLADeviationsPoint, 0, len(rows))
		out.Granularity = "day"
		for _, r := range rows {
			met, tot := r.SlaWaitMet, r.SlaWaitTotal
			if tot <= 0 {
				out.Points = append(out.Points, SLADeviationsPoint{
					Date:         r.BucketDate,
					WithinPct:    0,
					BreachPct:    0,
					SlaWaitMet:   met,
					SlaWaitTotal: tot,
				})
				continue
			}
			within := 100.0 * float64(met) / float64(tot)
			out.Points = append(out.Points, SLADeviationsPoint{
				Date:         r.BucketDate,
				WithinPct:    within,
				BreachPct:    100.0 - within,
				SlaWaitMet:   met,
				SlaWaitTotal: tot,
			})
		}
	}
	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	out.ComputedAt = computedAt
	return out, nil
}

// LoadPoint is daily ticket volume for the load chart.
type LoadPoint struct {
	Date             string `json:"date"`
	TicketsCreated   int    `json:"ticketsCreated"`
	TicketsCompleted int    `json:"ticketsCompleted"`
	NoShowCount      int    `json:"noShowCount"`
}

// LoadResponse mirrors volume-oriented timeseries without wait/service averages.
type LoadResponse struct {
	Points      []LoadPoint `json:"points"`
	ComputedAt  *time.Time  `json:"computedAt,omitempty"`
	Granularity string      `json:"granularity,omitempty"`
}

// GetLoad returns created/completed/no-show counts per day (same source as timeseries volume).
func (s *StatisticsService) GetLoad(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	requestedUserID *string,
	requestedServiceZoneID string,
) (*LoadResponse, error) {
	ts, err := s.GetTimeseries(ctx, subdivisionID, companyID, user, viewerID, dateFrom, dateTo, "volume", requestedUserID, requestedServiceZoneID)
	if err != nil {
		return nil, err
	}
	out := &LoadResponse{Points: make([]LoadPoint, 0, len(ts.Points))}
	for _, p := range ts.Points {
		out.Points = append(out.Points, LoadPoint{
			Date:             p.Date,
			TicketsCreated:   p.TicketsCreated,
			TicketsCompleted: p.TicketsCompleted,
			NoShowCount:      p.NoShowCount,
		})
	}
	out.ComputedAt = ts.ComputedAt
	out.Granularity = ts.Granularity
	return out, nil
}

// UtilizationPoint combines serving time from tickets with idle/break intervals on counters.
// UtilizationPct is omitted when the bucket is inactive (no serving and no idle/break in that period).
type UtilizationPoint struct {
	Date           string   `json:"date"`
	ServingMinutes float64  `json:"servingMinutes"`
	IdleMinutes    float64  `json:"idleMinutes"`
	UtilizationPct *float64 `json:"utilizationPct,omitempty"`
}

// UtilizationResponse is per-day operator utilization (advanced reports).
type UtilizationResponse struct {
	Points      []UtilizationPoint `json:"points"`
	ComputedAt  *time.Time         `json:"computedAt,omitempty"`
	Granularity string             `json:"granularity,omitempty"`
}

// utilizationIntervalRow scans counter_operator_intervals for idle/break overlap.
type utilizationIntervalRow struct {
	StartedAt time.Time  `gorm:"column:started_at"`
	EndedAt   *time.Time `gorm:"column:ended_at"`
}

// GetUtilization estimates serving vs idle+break time for one operator.
// Calendar days follow the subdivision timezone. Service minutes come from ticket in_service segments;
// idle/break from counter_operator_intervals. Hours where serving+idle+break are all zero are excluded
// from percentage (omitted on hourly series; skipped when aggregating a calendar day).
// This is not a branch-wide “counters online vs on break” report — only the chosen operator.
func (s *StatisticsService) GetUtilization(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	targetUserID string,
	dateFrom, dateTo string,
) (*UtilizationResponse, error) {
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
	if !sc.Expanded && strings.TrimSpace(sc.ForceUserID) != strings.TrimSpace(targetUserID) {
		return nil, errors.New("forbidden")
	}
	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	days, err := statisticsDayListInLocation(loc, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	df, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateFrom), loc)
	if err != nil {
		return nil, errors.New("invalid dateFrom")
	}
	dt, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateTo), loc)
	if err != nil {
		return nil, errors.New("invalid dateTo")
	}
	startUTC := time.Date(df.Year(), df.Month(), df.Day(), 0, 0, 0, 0, loc).UTC()
	endUTC := time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1).UTC()

	var intervalRows []utilizationIntervalRow
	q := `
SELECT started_at, ended_at
FROM counter_operator_intervals
WHERE user_id = ?
  AND unit_id = ?
  AND kind IN ('idle', 'break')
  AND started_at < ?::timestamptz
  AND COALESCE(ended_at, NOW()) > ?::timestamptz
`
	if err := s.db.WithContext(ctx).Raw(q, targetUserID, subdivisionID, endUTC, startUTC).Scan(&intervalRows).Error; err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	db := s.db.WithContext(ctx)

	const eps = 1e-6

	buildDay := func(day string) (servH, idleH [24]float64, err error) {
		dayStart, err := time.ParseInLocation("2006-01-02", day, loc)
		if err != nil {
			return servH, idleH, err
		}
		ds := time.Date(dayStart.Year(), dayStart.Month(), dayStart.Day(), 0, 0, 0, 0, loc)
		dayStartUTC := ds.UTC()
		// Next local midnight (not +24h) so DST long/short days stay aligned to the calendar date.
		dayEndUTC := ds.AddDate(0, 0, 1).UTC()

		servH, err = operatorServiceMinutesByHourForDay(s.segmentsRepo, db, subdivisionID, targetUserID, day, loc, dayStartUTC, dayEndUTC)
		if err != nil {
			return servH, idleH, err
		}
		idleH = idleBreakMinutesByHourForDay(intervalRows, ds, now)
		return servH, idleH, nil
	}

	aggregateDay := func(servH, idleH [24]float64) (servSum, idleSum float64, pct *float64) {
		for h := 0; h < 24; h++ {
			if servH[h]+idleH[h] <= eps {
				continue
			}
			servSum += servH[h]
			idleSum += idleH[h]
		}
		den := servSum + idleSum
		if den <= eps {
			return servSum, idleSum, nil
		}
		v := 100.0 * servSum / den
		return servSum, idleSum, &v
	}

	var points []UtilizationPoint
	var granularity string

	if len(days) == 1 {
		d := days[0]
		servH, idleH, err := buildDay(d)
		if err != nil {
			return nil, err
		}
		points = make([]UtilizationPoint, 0, 24)
		for h := 0; h < 24; h++ {
			sv := servH[h]
			iv := idleH[h]
			pt := UtilizationPoint{
				Date:           hourlyDateLabel(d, h),
				ServingMinutes: sv,
				IdleMinutes:    iv,
			}
			if sv+iv > eps {
				x := 100.0 * sv / (sv + iv)
				pt.UtilizationPct = &x
			}
			points = append(points, pt)
		}
		granularity = "hour"
	} else {
		points = make([]UtilizationPoint, 0, len(days))
		for _, d := range days {
			servH, idleH, err := buildDay(d)
			if err != nil {
				return nil, err
			}
			servSum, idleSum, pct := aggregateDay(servH, idleH)
			points = append(points, UtilizationPoint{
				Date:           d,
				ServingMinutes: servSum,
				IdleMinutes:    idleSum,
				UtilizationPct: pct,
			})
		}
		granularity = "day"
	}

	out := &UtilizationResponse{Points: points, Granularity: granularity}
	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	out.ComputedAt = computedAt
	return out, nil
}

func idleBreakMinutesByHourForDay(intervalRows []utilizationIntervalRow, dayStartInLoc time.Time, now time.Time) [24]float64 {
	var out [24]float64
	loc := dayStartInLoc.Location()
	day0 := time.Date(dayStartInLoc.Year(), dayStartInLoc.Month(), dayStartInLoc.Day(), 0, 0, 0, 0, loc)
	for h := 0; h < 24; h++ {
		hsLoc := time.Date(day0.Year(), day0.Month(), day0.Day(), h, 0, 0, 0, loc)
		var heLoc time.Time
		if h == 23 {
			heLoc = day0.AddDate(0, 0, 1)
		} else {
			heLoc = time.Date(day0.Year(), day0.Month(), day0.Day(), h+1, 0, 0, 0, loc)
		}
		hs := hsLoc.UTC()
		he := heLoc.UTC()
		var sum float64
		for i := range intervalRows {
			ir := &intervalRows[i]
			end := now
			if ir.EndedAt != nil {
				end = ir.EndedAt.UTC()
			}
			sum += overlapMinutesUTC(ir.StartedAt.UTC(), end, hs, he)
		}
		out[h] = sum
	}
	return out
}

// overlapMinutesUTC returns overlap length in minutes between [a0,a1) and [b0,b1), all in UTC.
func overlapMinutesUTC(a0, a1, b0, b1 time.Time) float64 {
	if !a1.After(a0) || !b1.After(b0) {
		return 0
	}
	left := a0
	if b0.After(left) {
		left = b0
	}
	right := a1
	if b1.Before(right) {
		right = b1
	}
	if !right.After(left) {
		return 0
	}
	return right.Sub(left).Minutes()
}

func statisticsDayListInLocation(loc *time.Location, from, to string) ([]string, error) {
	df, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(from), loc)
	if err != nil {
		return nil, errors.New("invalid dateFrom")
	}
	dt, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(to), loc)
	if err != nil {
		return nil, errors.New("invalid dateTo")
	}
	if dt.Before(df) {
		return nil, errors.New("dateTo before dateFrom")
	}
	var days []string
	for d := df; !d.After(dt); d = d.AddDate(0, 0, 1) {
		days = append(days, d.Format("2006-01-02"))
	}
	return days, nil
}

// SurveyScorePoint is one bucket for survey chart.
type SurveyScorePoint struct {
	Date           string   `json:"date"`
	AvgScoreNorm5  *float64 `json:"avgScoreNorm5,omitempty"`
	QuestionID     string   `json:"questionId,omitempty"`
	AvgScoreNative *float64 `json:"avgScoreNative,omitempty"`
	ScaleMin       *float64 `json:"scaleMin,omitempty"`
	ScaleMax       *float64 `json:"scaleMax,omitempty"`
}

type SurveyScoresResponse struct {
	Mode        string             `json:"mode"`
	Points      []SurveyScorePoint `json:"points"`
	ComputedAt  *time.Time         `json:"computedAt,omitempty"`
	Granularity string             `json:"granularity,omitempty"`
}

// GetSurveyScores aggregates guest survey scores from live survey_responses (hourly for a single calendar day, daily for longer ranges).
func (s *StatisticsService) GetSurveyScores(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	dateFrom, dateTo string,
	surveyID *string,
	questionIDs []string,
) (*SurveyScoresResponse, error) {
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
	if len(questionIDs) > 0 && (surveyID == nil || strings.TrimSpace(*surveyID) == "") {
		return nil, errors.New("surveyId is required when questionIds are provided")
	}
	return s.getSurveyScoresLive(ctx, subdivisionID, dateFrom, dateTo, surveyID, questionIDs)
}

func statisticsDayList(from, to string) ([]string, error) {
	df, err := time.Parse("2006-01-02", strings.TrimSpace(from))
	if err != nil {
		return nil, errors.New("invalid dateFrom")
	}
	dt, err := time.Parse("2006-01-02", strings.TrimSpace(to))
	if err != nil {
		return nil, errors.New("invalid dateTo")
	}
	if dt.Before(df) {
		return nil, errors.New("dateTo before dateFrom")
	}
	var days []string
	for d := df; !d.After(dt); d = d.AddDate(0, 0, 1) {
		days = append(days, d.Format("2006-01-02"))
	}
	return days, nil
}

// EmployeeRadarResponse normalized axes 0–100 (MVP from latest bucket averages).
type EmployeeRadarResponse struct {
	UserID         string     `json:"userId"`
	Rating         float64    `json:"rating"`
	SlaWait        float64    `json:"slaWait"`
	SlaService     float64    `json:"slaService"`
	TicketsPerHour float64    `json:"ticketsPerHour"`
	ComputedAt     *time.Time `json:"computedAt,omitempty"`
}

func (s *StatisticsService) GetEmployeeRadar(
	ctx context.Context,
	subdivisionID string,
	companyID string,
	user *models.User,
	viewerID string,
	targetUserID string,
) (*EmployeeRadarResponse, error) {
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
	if !sc.Expanded && strings.TrimSpace(sc.ForceUserID) != strings.TrimSpace(targetUserID) {
		return nil, errors.New("forbidden")
	}
	// Last 30 calendar days inclusive in subdivision local time (today and the prior 29 days).
	locRadar := time.UTC
	if tzName, tzErr := s.loadSubdivisionTimezoneName(ctx, subdivisionID); tzErr == nil {
		if l, le := time.LoadLocation(tzName); le == nil && l != nil {
			locRadar = l
		}
	}
	now := time.Now().In(locRadar)
	from := now.AddDate(0, 0, -29).Format("2006-01-02")
	to := now.Format("2006-01-02")
	zq := repository.StatisticsZoneQuery{WholeSubdivision: true}
	rows, err := s.statsRepo.ListDailyBuckets(subdivisionID, from, to, &targetUserID, zq)
	if err != nil {
		return nil, err
	}
	var servN int64
	var servSum int64
	var slaMet, slaTot int
	var completed int
	for _, r := range rows {
		servN += int64(r.ServiceCount)
		servSum += r.ServiceSumMs
		slaMet += r.SlaWaitMet
		slaTot += r.SlaWaitTotal
		completed += r.TicketsCompleted
	}
	out := &EmployeeRadarResponse{UserID: targetUserID}
	if slaTot > 0 {
		out.SlaWait = 100.0 * float64(slaMet) / float64(slaTot)
	} else {
		out.SlaWait = 100
	}
	if servN > 0 {
		avgMin := float64(servSum) / float64(servN) / 60000.0
		const targetMin = 20.0
		if avgMin <= targetMin {
			out.SlaService = 100
		} else {
			pen := (avgMin - targetMin) / targetMin
			if pen > 1 {
				pen = 1
			}
			out.SlaService = 100 * (1 - pen*0.65)
		}
	} else {
		out.SlaService = 100
	}
	out.Rating = 0
	surveyRows, err := s.statsRepo.ListSurveyDaily(subdivisionID, from, to)
	if err == nil {
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
			out.Rating = (avg - 1) / 4 * 100
			if out.Rating < 0 {
				out.Rating = 0
			}
			if out.Rating > 100 {
				out.Rating = 100
			}
		}
	}
	daysInclusive := 30
	if df, errFrom := time.ParseInLocation("2006-01-02", from, time.UTC); errFrom == nil {
		if dt, errTo := time.ParseInLocation("2006-01-02", to, time.UTC); errTo == nil && !dt.Before(df) {
			daysInclusive = int(dt.Sub(df).Hours()/24) + 1
			if daysInclusive < 1 {
				daysInclusive = 1
			}
		}
	}
	const workHoursPerDay = 8.0
	if completed > 0 {
		out.TicketsPerHour = float64(completed) / (float64(daysInclusive) * workHoursPerDay)
	}
	computedAt, err := s.operationalStatisticsAsOf(subdivisionID)
	if err != nil {
		return nil, err
	}
	out.ComputedAt = computedAt
	return out, nil
}
