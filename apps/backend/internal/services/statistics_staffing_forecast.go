package services

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ErrStaffingForecastNoData is returned when there are not enough historical tickets
// to compute a meaningful forecast.
var ErrStaffingForecastNoData = errors.New("not enough historical data for staffing forecast")

// StaffingForecastParams holds query parameters for the staffing forecast endpoint.
type StaffingForecastParams struct {
	TargetDate       string  // YYYY-MM-DD; defaults to tomorrow
	TargetSLAPercent float64 // e.g. 90.0 means 90% of callers wait ≤ TargetMaxWaitMin; default 90
	TargetMaxWaitMin float64 // target max wait in minutes; default 5
	LookbackWeeks    int     // how many previous same-day-of-week samples to use; default 4
}

// HourlyStaffingForecast is the per-hour recommendation.
type HourlyStaffingForecast struct {
	Hour              int     `json:"hour"`              // 0–23
	ExpectedArrivals  float64 `json:"expectedArrivals"`  // avg tickets expected this hour
	AvgServiceTimeMin float64 `json:"avgServiceTimeMin"` // avg handle time in minutes
	RecommendedStaff  int     `json:"recommendedStaff"`  // minimum agents to meet SLA
	ExpectedSlaPct    float64 `json:"expectedSlaPct"`    // Erlang C P(wait≤target) with recommended agents
}

// DailyStaffingSummary aggregates the hourly data.
type DailyStaffingSummary struct {
	TotalExpectedArrivals float64 `json:"totalExpectedArrivals"`
	PeakHour              int     `json:"peakHour"`
	PeakArrivals          float64 `json:"peakArrivals"`
	MaxRecommendedStaff   int     `json:"maxRecommendedStaff"`
	AvgRecommendedStaff   float64 `json:"avgRecommendedStaff"`
}

// StaffingForecastResponse is the full API response.
type StaffingForecastResponse struct {
	UnitID           string                   `json:"unitId"`
	TargetDate       string                   `json:"targetDate"`
	DayOfWeek        string                   `json:"dayOfWeek"`
	TargetSLAPct     float64                  `json:"targetSlaPct"`
	TargetMaxWaitMin float64                  `json:"targetMaxWaitMin"`
	HourlyForecasts  []HourlyStaffingForecast `json:"hourlyForecasts"`
	DailySummary     DailyStaffingSummary     `json:"dailySummary"`
}

// hourlyArrivalRow holds the raw SQL aggregation result.
type hourlyArrivalRow struct {
	Hour          int     `gorm:"column:hour"`
	AvgArrivals   float64 `gorm:"column:avg_arrivals"`
	AvgServiceMin float64 `gorm:"column:avg_service_min"`
}

// GetStaffingForecast computes an hourly staffing recommendation for the given unit and parameters.
// It uses Variant A from the plan: aggregate arrival rate directly from tickets.created_at.
// Requires the advanced_reports plan feature — returns an error with "plan does not include" when absent.
func (s *StatisticsService) GetStaffingForecast(ctx context.Context, unitID, companyID string, p StaffingForecastParams) (*StaffingForecastResponse, error) {
	ok, err := CompanyAllowsAdvancedReports(ctx, s.db, companyID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("plan does not include advanced reports")
	}
	p = applyForecastDefaults(p)

	tzName := "UTC"
	if name, tzErr := s.loadSubdivisionTimezoneName(ctx, unitID); tzErr == nil {
		name = strings.TrimSpace(name)
		if name != "" {
			tzName = name
		}
	}
	loc := time.UTC
	if l, lErr := time.LoadLocation(tzName); lErr == nil && l != nil {
		loc = l
	}
	targetDate, err := time.ParseInLocation("2006-01-02", p.TargetDate, loc)
	if err != nil {
		return nil, errors.New("invalid targetDate: must be YYYY-MM-DD")
	}
	targetWeekday := targetDate.Weekday()

	// Build list of historical sample dates: last N occurrences of the same weekday before targetDate.
	sampleDates := historicalSameDayDates(targetDate, targetWeekday, p.LookbackWeeks)
	if len(sampleDates) == 0 {
		return nil, ErrStaffingForecastNoData
	}

	// Query hourly arrival counts AND avg service time per hour for those sample dates.
	rows, err := queryHourlyArrivals(ctx, s.db, unitID, tzName, sampleDates)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrStaffingForecastNoData
	}

	// Build hourly forecasts using Erlang C.
	hourlyForecasts := make([]HourlyStaffingForecast, 0, 24)
	for _, row := range rows {
		// Erlang C inputs:
		// λ = arrivals per minute
		// μ = service rate per agent per minute = 1 / avg_service_min
		arrPerMin := row.AvgArrivals / 60.0
		avgSvcMin := row.AvgServiceMin
		if avgSvcMin <= 0 {
			avgSvcMin = 5.0 // sensible fallback: 5 min average service
		}
		muPerAgent := 1.0 / avgSvcMin

		n := erlangCMinAgents(arrPerMin, muPerAgent, p.TargetSLAPercent/100.0, p.TargetMaxWaitMin)
		expectedSLA := erlangCSLA(arrPerMin, muPerAgent, n, p.TargetMaxWaitMin)

		hourlyForecasts = append(hourlyForecasts, HourlyStaffingForecast{
			Hour:              row.Hour,
			ExpectedArrivals:  row.AvgArrivals,
			AvgServiceTimeMin: avgSvcMin,
			RecommendedStaff:  n,
			ExpectedSlaPct:    math.Round(expectedSLA*1000) / 10, // 1 decimal
		})
	}

	summary := buildDailySummary(hourlyForecasts)

	return &StaffingForecastResponse{
		UnitID:           unitID,
		TargetDate:       p.TargetDate,
		DayOfWeek:        targetWeekday.String(),
		TargetSLAPct:     p.TargetSLAPercent,
		TargetMaxWaitMin: p.TargetMaxWaitMin,
		HourlyForecasts:  hourlyForecasts,
		DailySummary:     summary,
	}, nil
}

// applyForecastDefaults fills in zero-value params with sensible defaults.
func applyForecastDefaults(p StaffingForecastParams) StaffingForecastParams {
	if p.TargetDate == "" {
		p.TargetDate = time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	}
	if p.TargetSLAPercent <= 0 || p.TargetSLAPercent >= 100 {
		p.TargetSLAPercent = 90.0
	}
	if p.TargetMaxWaitMin <= 0 {
		p.TargetMaxWaitMin = 5.0
	}
	if p.LookbackWeeks <= 0 {
		p.LookbackWeeks = 4
	}
	if p.LookbackWeeks > 52 {
		p.LookbackWeeks = 52
	}
	return p
}

// historicalSameDayDates returns the last n dates with the same weekday before targetDate.
func historicalSameDayDates(targetDate time.Time, weekday time.Weekday, n int) []string {
	out := make([]string, 0, n)
	d := targetDate.AddDate(0, 0, -7)
	for len(out) < n {
		if d.Weekday() == weekday {
			out = append(out, d.Format("2006-01-02"))
		}
		d = d.AddDate(0, 0, -1)
		// Guard against runaway loop
		if targetDate.Sub(d) > 365*24*time.Hour {
			break
		}
	}
	return out
}

// queryHourlyArrivals aggregates avg ticket arrivals per hour (and avg service time) from
// historical sample dates for the given unit.
func queryHourlyArrivals(ctx context.Context, db *gorm.DB, unitID, tzName string, sampleDates []string) ([]hourlyArrivalRow, error) {
	if strings.TrimSpace(tzName) == "" {
		tzName = "UTC"
	}
	// Bucket by subdivision-local calendar day and hour (same semantics as statistics_hourly).
	query := `
WITH daily_hourly AS (
    SELECT
        (t.created_at AT TIME ZONE ?)::date                          AS sample_date,
        EXTRACT(HOUR FROM (t.created_at AT TIME ZONE ?))::int        AS hour,
        COUNT(*)                                     AS arrivals,
        AVG(
            CASE
                WHEN t.completed_at IS NOT NULL AND t.called_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (t.completed_at - t.called_at)) / 60.0
            END
        )                                            AS avg_svc_min
    FROM tickets t
    WHERE t.unit_id = ?
      AND (t.created_at AT TIME ZONE ?)::date IN (?)
    GROUP BY sample_date, hour
)
SELECT
    hour,
    AVG(arrivals)::float   AS avg_arrivals,
    AVG(avg_svc_min)::float AS avg_service_min
FROM daily_hourly
GROUP BY hour
ORDER BY hour
`
	var rows []hourlyArrivalRow
	err := db.WithContext(ctx).Raw(query, tzName, tzName, unitID, tzName, sampleDates).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// ---------------------------------------------------------------------------
// Erlang C implementation
// ---------------------------------------------------------------------------

// erlangCMinAgents returns the minimum number of agents n such that
// P(wait ≤ targetWaitMin) ≥ targetSLA for an M/M/n queue.
func erlangCMinAgents(lambdaPerMin, muPerAgent, targetSLAFraction, targetWaitMin float64) int {
	if lambdaPerMin <= 0 {
		return 1
	}
	// Start from the minimum feasible n (must satisfy ρ < 1 per agent, i.e. n > λ/μ).
	minN := int(math.Ceil(lambdaPerMin/muPerAgent)) + 1
	if minN < 1 {
		minN = 1
	}
	for n := minN; n <= 200; n++ {
		sla := erlangCSLA(lambdaPerMin, muPerAgent, n, targetWaitMin)
		if sla >= targetSLAFraction {
			return n
		}
	}
	return 200 // cap at 200 (effectively means very high load)
}

// erlangCSLA computes P(wait ≤ t) for an M/M/n queue using the Erlang C formula.
//
//	λ = arrival rate (per minute)
//	μ = service rate per agent (per minute)
//	n = number of agents
//	t = target wait time (minutes)
func erlangCSLA(lambdaPerMin, muPerAgent float64, n int, t float64) float64 {
	if n <= 0 || lambdaPerMin <= 0 || muPerAgent <= 0 {
		return 0
	}
	rho := lambdaPerMin / (float64(n) * muPerAgent) // utilisation per server
	if rho >= 1.0 {
		return 0 // unstable queue
	}
	a := lambdaPerMin / muPerAgent // offered load in Erlangs

	// Erlang C probability: P(wait > 0) = C(n, a)
	c := erlangC(n, a)

	// P(wait ≤ t) = 1 - C(n,a) * exp(-(n*μ - λ)*t)
	exponent := -(float64(n)*muPerAgent - lambdaPerMin) * t
	pWaitLessT := 1.0 - c*math.Exp(exponent)
	if pWaitLessT < 0 {
		pWaitLessT = 0
	}
	return pWaitLessT
}

// erlangC computes the Erlang C formula P(wait > 0) for M/M/n.
// n = number of servers, a = offered load (λ/μ).
func erlangC(n int, a float64) float64 {
	if a <= 0 {
		return 0
	}
	// Numerically stable computation using log-factorials.
	// P(wait > 0) = (a^n / n!) * (n / (n - a)) / [ Σ_{k=0}^{n-1} a^k/k! + (a^n/n!) * n/(n-a) ]
	nF := float64(n)
	rho := a / nF
	if rho >= 1.0 {
		return 1.0 // saturated
	}

	// Compute a^n / n! via log to avoid overflow.
	logAnOverNFact := float64(n)*math.Log(a) - logFactorial(n)
	anOverNFact := math.Exp(logAnOverNFact)

	numerator := anOverNFact * nF / (nF - a)

	// Sum of a^k/k! for k=0..n-1
	var sumAkKFact float64
	logAkOverKFact := 0.0 // starts at a^0/0! = 1
	for k := 0; k < n; k++ {
		sumAkKFact += math.Exp(logAkOverKFact)
		if k < n-1 {
			logAkOverKFact += math.Log(a) - math.Log(float64(k+1))
		}
	}

	denominator := sumAkKFact + numerator
	if denominator == 0 {
		return 0
	}
	return numerator / denominator
}

// logFactorial returns ln(n!) using Stirling for n > 20, exact for n ≤ 20.
func logFactorial(n int) float64 {
	if n <= 1 {
		return 0
	}
	if n <= 20 {
		v := 0.0
		for i := 2; i <= n; i++ {
			v += math.Log(float64(i))
		}
		return v
	}
	nF := float64(n)
	return nF*math.Log(nF) - nF + 0.5*math.Log(2*math.Pi*nF)
}

// buildDailySummary aggregates per-hour forecasts into a daily summary.
func buildDailySummary(forecasts []HourlyStaffingForecast) DailyStaffingSummary {
	if len(forecasts) == 0 {
		return DailyStaffingSummary{}
	}
	var totalArrivals float64
	var totalStaff int
	peakHour := forecasts[0].Hour
	peakArrivals := forecasts[0].ExpectedArrivals
	maxStaff := 0

	for _, f := range forecasts {
		totalArrivals += f.ExpectedArrivals
		totalStaff += f.RecommendedStaff
		if f.ExpectedArrivals > peakArrivals {
			peakArrivals = f.ExpectedArrivals
			peakHour = f.Hour
		}
		if f.RecommendedStaff > maxStaff {
			maxStaff = f.RecommendedStaff
		}
	}
	return DailyStaffingSummary{
		TotalExpectedArrivals: math.Round(totalArrivals*10) / 10,
		PeakHour:              peakHour,
		PeakArrivals:          math.Round(peakArrivals*10) / 10,
		MaxRecommendedStaff:   maxStaff,
		AvgRecommendedStaff:   math.Round(float64(totalStaff)/float64(len(forecasts))*10) / 10,
	}
}
