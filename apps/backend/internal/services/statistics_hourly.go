package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/repository"
)

// hourlyTicketCounts holds per-hour ticket volume for one calendar day in the subdivision timezone.
type hourlyTicketCounts struct {
	Created   [24]int
	Completed [24]int
	NoShow    [24]int
}

func hourlyDateLabel(bucketDate string, hour int) string {
	return fmt.Sprintf("%sT%02d:00:00", bucketDate, hour)
}

func (s *StatisticsService) loadSubdivisionTimezoneName(ctx context.Context, subdivisionID string) (string, error) {
	var tz string
	err := s.db.WithContext(ctx).Raw(`
SELECT COALESCE(NULLIF(TRIM(timezone), ''), 'UTC') FROM units WHERE id::text = ? LIMIT 1
`, subdivisionID).Scan(&tz).Error
	if err != nil {
		return "", err
	}
	tz = strings.TrimSpace(tz)
	if tz == "" {
		tz = "UTC"
	}
	return tz, nil
}

func appendTicketZoneFilter(sb *strings.Builder, args *[]interface{}, zoneQ repository.StatisticsZoneQuery) {
	switch {
	case zoneQ.WholeSubdivision:
		return
	case len(zoneQ.ZoneIDs) == 1:
		sb.WriteString(" AND t.service_zone_id::text = ?")
		*args = append(*args, zoneQ.ZoneIDs[0])
	default:
		sb.WriteString(" AND t.service_zone_id::text IN ?")
		*args = append(*args, zoneQ.ZoneIDs)
	}
}

type hourCountRow struct {
	Hr int `gorm:"column:hr"`
	C  int `gorm:"column:c"`
}

func (s *StatisticsService) hourlyTicketVolume(
	ctx context.Context,
	subdivisionID, bucketDate string,
	zoneQ repository.StatisticsZoneQuery,
) (hourlyTicketCounts, error) {
	var out hourlyTicketCounts
	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return out, err
	}

	fill := func(rows []hourCountRow, target *[24]int) {
		for _, r := range rows {
			if r.Hr >= 0 && r.Hr < 24 {
				target[r.Hr] = r.C
			}
		}
	}

	// Created: bucket by local hour of created_at.
	{
		var sb strings.Builder
		var args []interface{}
		sb.WriteString(`
SELECT EXTRACT(HOUR FROM (t.created_at AT TIME ZONE ?))::int AS hr, COUNT(*)::int AS c
FROM tickets t
WHERE t.unit_id::text = ?
  AND (t.created_at AT TIME ZONE ?)::date = ?::date
`)
		args = append(args, tzName, subdivisionID, tzName, bucketDate)
		appendTicketZoneFilter(&sb, &args, zoneQ)
		sb.WriteString(`
GROUP BY 1
`)
		var rows []hourCountRow
		if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&rows).Error; err != nil {
			return out, err
		}
		fill(rows, &out.Created)
	}

	// Completed: hour of completed_at (same semantics as daily rollup).
	{
		var sb strings.Builder
		var args []interface{}
		sb.WriteString(`
SELECT EXTRACT(HOUR FROM (t.completed_at AT TIME ZONE ?))::int AS hr, COUNT(*)::int AS c
FROM tickets t
WHERE t.unit_id::text = ?
  AND t.completed_at IS NOT NULL
  AND (t.completed_at AT TIME ZONE ?)::date = ?::date
  AND t.status IN ('served','no_show','cancelled','completed')
`)
		args = append(args, tzName, subdivisionID, tzName, bucketDate)
		appendTicketZoneFilter(&sb, &args, zoneQ)
		sb.WriteString(`
GROUP BY 1
`)
		var rows []hourCountRow
		if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&rows).Error; err != nil {
			return out, err
		}
		fill(rows, &out.Completed)
	}

	// No-show: hour of completed_at when status = no_show.
	{
		var sb strings.Builder
		var args []interface{}
		sb.WriteString(`
SELECT EXTRACT(HOUR FROM (t.completed_at AT TIME ZONE ?))::int AS hr, COUNT(*)::int AS c
FROM tickets t
WHERE t.unit_id::text = ?
  AND t.completed_at IS NOT NULL
  AND (t.completed_at AT TIME ZONE ?)::date = ?::date
  AND t.status = 'no_show'
`)
		args = append(args, tzName, subdivisionID, tzName, bucketDate)
		appendTicketZoneFilter(&sb, &args, zoneQ)
		sb.WriteString(`
GROUP BY 1
`)
		var rows []hourCountRow
		if err := s.db.WithContext(ctx).Raw(sb.String(), args...).Scan(&rows).Error; err != nil {
			return out, err
		}
		fill(rows, &out.NoShow)
	}

	return out, nil
}

// zoneFilterStrings returns service_zone filter arguments for rollup helpers: [""] = whole subdivision.
func zoneFilterStrings(zoneQ repository.StatisticsZoneQuery) []string {
	if zoneQ.WholeSubdivision {
		return []string{""}
	}
	out := make([]string, 0, len(zoneQ.ZoneIDs))
	for _, z := range zoneQ.ZoneIDs {
		z = strings.TrimSpace(z)
		if z != "" {
			out = append(out, z)
		}
	}
	if len(out) == 0 {
		return []string{""}
	}
	return out
}

func hourRangeUTC(bucketDate string, hour int, loc *time.Location) (startUTC, endUTC time.Time) {
	d, _ := time.ParseInLocation("2006-01-02", strings.TrimSpace(bucketDate), loc)
	startLocal := time.Date(d.Year(), d.Month(), d.Day(), hour, 0, 0, 0, loc)
	endLocal := startLocal.Add(time.Hour)
	return startLocal.UTC(), endLocal.UTC()
}

// rollupWaitServiceSLAForHour matches daily RollupUnitDay semantics but for [startUTC,endUTC):
// wait/SLA from tickets whose qualifying call is in range; service segments for tickets completed in range.
func (s *StatisticsService) rollupWaitServiceSLAForHour(
	ctx context.Context,
	subdivisionID string,
	startUTC, endUTC time.Time,
	zoneQ repository.StatisticsZoneQuery,
) (waitSumMs int64, waitCount int, slaMet int, slaTotal int, servSumMs int64, servCount int, err error) {
	_ = ctx
	zones := zoneFilterStrings(zoneQ)
	for _, z := range zones {
		ws, wc, sm, st, e := computeWaitSLAForTicketsCalledInRange(s.segmentsRepo, subdivisionID, startUTC, endUTC, z)
		if e != nil {
			return 0, 0, 0, 0, 0, 0, e
		}
		ss, sc, e := aggregateServiceTimeForServedTicketsCompletedInRange(s.segmentsRepo, subdivisionID, z, startUTC, endUTC)
		if e != nil {
			return 0, 0, 0, 0, 0, 0, e
		}
		waitSumMs += ws
		waitCount += wc
		slaMet += sm
		slaTotal += st
		servSumMs += ss
		servCount += sc
	}
	return waitSumMs, waitCount, slaMet, slaTotal, servSumMs, servCount, nil
}

func buildTimeseriesPointFromHourlyRollup(
	dateStr string,
	vol hourlyTicketCounts,
	hour int,
	waitSumMs int64,
	waitCount int,
	slaMet, slaTotal int,
	servSumMs int64,
	servCount int,
) TimeseriesPoint {
	p := TimeseriesPoint{
		Date:             dateStr,
		TicketsCreated:   vol.Created[hour],
		TicketsCompleted: vol.Completed[hour],
		NoShowCount:      vol.NoShow[hour],
	}
	if waitCount > 0 {
		v := float64(waitSumMs) / float64(waitCount) / 60000.0
		p.AvgWaitMinutes = &v
	}
	if servCount > 0 {
		v := float64(servSumMs) / float64(servCount) / 60000.0
		p.AvgServiceMinutes = &v
	}
	if slaTotal > 0 {
		v := 100.0 * float64(slaMet) / float64(slaTotal)
		p.SlaWaitMetPct = &v
	}
	return p
}

// buildHourlyTimeseriesPoints returns exactly 24 points (every clock hour). Nullable averages mean "no samples"
// for that hour (JSON omits the field); counts are always present as integers (zeros allowed).
// Wait/service/SLA recomputed per hour with the same warehouse semantics as the daily rollup.
func (s *StatisticsService) buildHourlyTimeseriesPoints(
	ctx context.Context,
	subdivisionID, bucketDate string,
	zoneQ repository.StatisticsZoneQuery,
) ([]TimeseriesPoint, error) {
	vol, err := s.hourlyTicketVolume(ctx, subdivisionID, bucketDate, zoneQ)
	if err != nil {
		return nil, err
	}
	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	out := make([]TimeseriesPoint, 0, 24)
	for h := 0; h < 24; h++ {
		startUTC, endUTC := hourRangeUTC(bucketDate, h, loc)
		ws, wc, sm, st, ss, sc, err := s.rollupWaitServiceSLAForHour(ctx, subdivisionID, startUTC, endUTC, zoneQ)
		if err != nil {
			return nil, err
		}
		out = append(out, buildTimeseriesPointFromHourlyRollup(
			hourlyDateLabel(bucketDate, h),
			vol, h, ws, wc, sm, st, ss, sc,
		))
	}
	return out, nil
}

// buildHourlySLADeviationPoints returns exactly 24 points; when slaTotal==0, within/breach are 0 (no denominator).
func (s *StatisticsService) buildHourlySLADeviationPoints(
	ctx context.Context,
	subdivisionID, bucketDate string,
	zoneQ repository.StatisticsZoneQuery,
) ([]SLADeviationsPoint, error) {
	tzName, err := s.loadSubdivisionTimezoneName(ctx, subdivisionID)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	out := make([]SLADeviationsPoint, 0, 24)
	for h := 0; h < 24; h++ {
		startUTC, endUTC := hourRangeUTC(bucketDate, h, loc)
		_, _, slaMet, slaTotal, _, _, err := s.rollupWaitServiceSLAForHour(ctx, subdivisionID, startUTC, endUTC, zoneQ)
		if err != nil {
			return nil, err
		}
		var pt SLADeviationsPoint
		pt.Date = hourlyDateLabel(bucketDate, h)
		pt.SlaWaitMet = slaMet
		pt.SlaWaitTotal = slaTotal
		if slaTotal <= 0 {
			pt.WithinPct = 0
			pt.BreachPct = 0
		} else {
			pt.WithinPct = 100.0 * float64(slaMet) / float64(slaTotal)
			pt.BreachPct = 100.0 - pt.WithinPct
		}
		out = append(out, pt)
	}
	return out, nil
}
