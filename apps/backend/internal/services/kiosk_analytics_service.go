package services

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"gorm.io/gorm"
)

// KioskAnalyticsService aggregates queue funnel + tickets for a single unit (5.1).
type KioskAnalyticsService struct {
	db *gorm.DB
}

// NewKioskAnalyticsService returns a service instance.
func NewKioskAnalyticsService(db *gorm.DB) *KioskAnalyticsService {
	return &KioskAnalyticsService{db: db}
}

// KioskServiceAgg is ticket_created counts by service in range.
type KioskServiceAgg struct {
	ServiceID   string `json:"serviceId"`
	Tickets     int64  `json:"tickets"`
	DisplayName string `json:"displayName,omitempty"`
}

// KioskHourlyAgg is per-hour created counts in unit wall clock.
type KioskHourlyAgg struct {
	HourLabel string `json:"hourLabel"`
	Tickets   int64  `json:"tickets"`
}

// KioskFunnelChannelAgg counts queue_funnel ticket_created by channel.
type KioskFunnelChannelAgg struct {
	Channel string `json:"channel"`
	Count   int64  `json:"count"`
}

// KioskAnalyticsResult is the response for GET .../kiosk-analytics.
type KioskAnalyticsResult struct {
	UnitID     string    `json:"unitId"`
	FromUTC    time.Time `json:"fromUtc"`
	ToUTC      time.Time `json:"toUtc"`
	ComputedAt time.Time `json:"computedAt"`
	Tickets    struct {
		Created   int64 `json:"created"`
		Served    int64 `json:"served"`
		NoShow    int64 `json:"noShow"`
		Abandoned int64 `json:"abandonedVisitor"`
	} `json:"tickets"`
	QueueFunnel struct {
		ByChannel []KioskFunnelChannelAgg `json:"byChannel,omitempty"`
	} `json:"queueFunnel"`
	ByService       []KioskServiceAgg `json:"byService"`
	ByHour          []KioskHourlyAgg  `json:"byHour"`
	Telemetry       KioskTelemetryAgg `json:"telemetry"`
	AbandonmentRate *float64          `json:"abandonmentRate,omitempty"`
}

// KioskTelemetryAgg summarises device samples in range.
type KioskTelemetryAgg struct {
	SampleCount  int64    `json:"sampleCount"`
	AvgRoundtrip *float64 `json:"avgRoundtripMs,omitempty"`
	PrinterError int64    `json:"printerErrorCount"`
	PaperOut     int64    `json:"paperOutCount"`
}

// ErrKioskPlanFeature is when tenant plan lacks kiosk analytics.
var ErrKioskPlanFeature = errors.New("plan does not include kiosk_operations_analytics")

// GetKioskAnalytics runs aggregate queries. Caller must enforce auth (statistics scope).
func (s *KioskAnalyticsService) GetKioskAnalytics(companyID, unitID string, from, to time.Time) (out *KioskAnalyticsResult, err error) {
	if companyID == "" {
		if err := s.db.Raw(`SELECT company_id FROM units WHERE id = ?`, unitID).Scan(&companyID).Error; err != nil || companyID == "" {
			return nil, err
		}
	}
	ok, err := CompanyHasPlanFeature(companyID, PlanFeatureKioskOperationsAnalytics)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrKioskPlanFeature
	}
	if to.Before(from) {
		return nil, errors.New("to before from")
	}
	if to.Sub(from) > 40*24*time.Hour {
		return nil, errors.New("date range too large (max 40 days)")
	}

	var tz string
	_ = s.db.Raw(`SELECT COALESCE(timezone, 'UTC') FROM units WHERE id = ?`, unitID).Scan(&tz).Error
	if strings.TrimSpace(tz) == "" {
		tz = "UTC"
	}
	loc, lerr := time.LoadLocation(tz)
	if lerr != nil {
		loc = time.UTC
	}

	out = &KioskAnalyticsResult{
		FromUTC:    from.UTC(),
		ToUTC:      to.UTC(),
		ComputedAt: time.Now().UTC(),
		UnitID:     unitID,
	}
	var created int64
	_ = s.db.Raw(`SELECT count(*)::bigint FROM tickets WHERE unit_id = $1 AND created_at >= $2 AND created_at < $3`, unitID, from, to).Scan(&created).Error
	var served, noshow int64
	_ = s.db.Raw(`SELECT count(*)::bigint FROM tickets WHERE unit_id = $1 AND status IN ('served','completed') AND completed_at IS NOT NULL AND completed_at >= $2 AND completed_at < $3`, unitID, from, to).Scan(&served).Error
	_ = s.db.Raw(`SELECT count(*)::bigint FROM tickets WHERE unit_id = $1 AND status = 'no_show' AND completed_at IS NOT NULL AND completed_at >= $2 AND completed_at < $3`, unitID, from, to).Scan(&noshow).Error
	var visitorCancel int64
	_ = s.db.Raw(`SELECT count(*)::bigint FROM queue_funnel_events WHERE unit_id = $1 AND event = 'ticket_outcome' AND created_at >= $2 AND created_at < $3 AND (meta->>'visitorExit') = 'cancel'`, unitID, from, to).Scan(&visitorCancel).Error
	out.Tickets.Created = created
	out.Tickets.Served = served
	out.Tickets.NoShow = noshow
	out.Tickets.Abandoned = visitorCancel
	if created > 0 {
		ab := float64(visitorCancel+noshow) / float64(created)
		out.AbandonmentRate = &ab
	}

	rows, qerr := s.db.Raw(`SELECT service_id, count(*)::bigint as c FROM tickets WHERE unit_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY service_id ORDER BY c DESC`, unitID, from, to).Rows()
	if qerr == nil {
		defer func() {
			if c := rows.Close(); c != nil && err == nil {
				err = fmt.Errorf("by-service rows: %w", c)
			}
		}()
		for rows.Next() {
			var sid string
			var c int64
			if err := rows.Scan(&sid, &c); err != nil {
				continue
			}
			agg := KioskServiceAgg{ServiceID: sid, Tickets: c}
			var n string
			_ = s.db.Raw(`SELECT name FROM services WHERE id = $1`, sid).Scan(&n).Error
			agg.DisplayName = n
			out.ByService = append(out.ByService, agg)
		}
	}
	// Per-hour: bucket in display TZ
	hr, herr := s.db.Raw(`
SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE $4, 'YYYY-MM-DD HH24:00') AS h, count(*)::bigint
FROM tickets WHERE unit_id = $1 AND created_at >= $2 AND created_at < $3
GROUP BY 1 ORDER BY 1`, unitID, from, to, tz).Rows()
	if herr == nil {
		defer func() {
			if c := hr.Close(); c != nil && err == nil {
				err = fmt.Errorf("by-hour rows: %w", c)
			}
		}()
		for hr.Next() {
			var h string
			var c int64
			_ = hr.Scan(&h, &c)
			_ = loc
			out.ByHour = append(out.ByHour, KioskHourlyAgg{HourLabel: h, Tickets: c})
		}
	} else {
		// fallback UTC hour
		hr2, e2 := s.db.Raw(`SELECT to_char(created_at, 'YYYY-MM-DD HH24:00'), count(*)::bigint FROM tickets WHERE unit_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY 1 ORDER BY 1`, unitID, from, to).Rows()
		if e2 == nil {
			defer func() {
				if c := hr2.Close(); c != nil && err == nil {
					err = fmt.Errorf("by-hour (utc fallback) rows: %w", c)
				}
			}()
			for hr2.Next() {
				var h string
				var c int64
				_ = hr2.Scan(&h, &c)
				out.ByHour = append(out.ByHour, KioskHourlyAgg{HourLabel: h + "Z", Tickets: c})
			}
		}
	}

	chRows, chErr := s.db.Raw(`
SELECT COALESCE(meta->>'channel','(unknown)'), count(*)::bigint
FROM queue_funnel_events
WHERE unit_id = $1 AND event = 'ticket_created' AND created_at >= $2 AND created_at < $3
GROUP BY 1 ORDER BY 2 DESC`, unitID, from, to).Rows()
	if chErr == nil {
		defer func() {
			if c := chRows.Close(); c != nil && err == nil {
				err = fmt.Errorf("funnel channel rows: %w", c)
			}
		}()
		for chRows.Next() {
			var ch string
			var c int64
			_ = chRows.Scan(&ch, &c)
			out.QueueFunnel.ByChannel = append(out.QueueFunnel.ByChannel, KioskFunnelChannelAgg{Channel: ch, Count: c})
		}
	}
	var tcount int64
	_ = s.db.Raw(`SELECT count(*)::bigint FROM kiosk_telemetry_events WHERE unit_id = $1 AND created_at >= $2 AND created_at < $3`, unitID, from, to).Scan(&tcount).Error
	out.Telemetry.SampleCount = tcount
	var avg sql.NullFloat64
	_ = s.db.Raw(`
SELECT avg((meta->>'roundtripMs')::float8) FROM kiosk_telemetry_events
WHERE unit_id = $1 AND kind = 'api_ping' AND created_at >= $2 AND created_at < $3
  AND meta->>'roundtripMs' IS NOT NULL`, unitID, from, to).Scan(&avg).Error
	if avg.Valid {
		v := avg.Float64
		out.Telemetry.AvgRoundtrip = &v
	}
	_ = s.db.Raw(`SELECT count(*)::bigint FROM kiosk_telemetry_events WHERE unit_id = $1 AND kind = 'print_error' AND created_at >= $2 AND created_at < $3`, unitID, from, to).Scan(&out.Telemetry.PrinterError).Error
	_ = s.db.Raw(`SELECT count(*)::bigint FROM kiosk_telemetry_events WHERE unit_id = $1 AND kind = 'paper_out' AND created_at >= $2 AND created_at < $3`, unitID, from, to).Scan(&out.Telemetry.PaperOut).Error

	return
}

// WriteKioskAnalyticsCSV writes CSV to w.
func WriteKioskAnalyticsCSV(w io.Writer, r *KioskAnalyticsResult) error {
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"kiosk_analytics", r.UnitID, r.FromUTC.Format(time.RFC3339), r.ToUTC.Format(time.RFC3339)})
	_ = cw.Write([]string{"tickets_created", fmtInt(r.Tickets.Created)})
	_ = cw.Write([]string{"tickets_served", fmtInt(r.Tickets.Served)})
	_ = cw.Write([]string{"tickets_noshow", fmtInt(r.Tickets.NoShow)})
	_ = cw.Write([]string{"visitor_cancels", fmtInt(r.Tickets.Abandoned)})
	for _, x := range r.QueueFunnel.ByChannel {
		_ = cw.Write([]string{"funnel_channel", x.Channel, fmtInt(x.Count)})
	}
	for _, x := range r.ByService {
		_ = cw.Write([]string{"by_service", x.ServiceID, x.DisplayName, fmtInt(x.Tickets)})
	}
	cw.Flush()
	return cw.Error()
}

func fmtInt(n int64) string { return fmt.Sprintf("%d", n) }

// MetaJSON marshals a map to JSON for telemetry meta.
func MetaJSON(m map[string]any) []byte {
	if m == nil {
		return nil
	}
	b, _ := json.Marshal(m)
	return b
}

// ParseKioskAnalyticsRange parses RFC3339 or date YYYY-MM-DD. Default: last 7d ending now.
func ParseKioskAnalyticsRange(fromQ, toQ string) (time.Time, time.Time, error) {
	now := time.Now().UTC()
	to := now
	if strings.TrimSpace(toQ) != "" {
		if t, err := time.Parse(time.RFC3339, strings.TrimSpace(toQ)); err == nil {
			to = t
		} else if t2, e2 := time.Parse("2006-01-02", strings.TrimSpace(toQ)); e2 == nil {
			to = t2.Add(24 * time.Hour)
		} else if t2, e2 := time.Parse("2006-01-02", strings.TrimSpace(toQ)); e2 == nil {
			to = t2.Add(24 * time.Hour)
		} else {
			return time.Time{}, time.Time{}, fmt.Errorf("parse to: %w", e2)
		}
	}
	var from time.Time
	if strings.TrimSpace(fromQ) == "" {
		from = to.AddDate(0, 0, -7)
	} else {
		if t, err := time.Parse(time.RFC3339, strings.TrimSpace(fromQ)); err == nil {
			from = t
		} else if t2, e2 := time.Parse("2006-01-02", strings.TrimSpace(fromQ)); e2 == nil {
			from = t2
		} else {
			return time.Time{}, time.Time{}, fmt.Errorf("parse from: %w", e2)
		}
	}
	if !to.After(from) {
		return time.Time{}, time.Time{}, errors.New("to must be after from")
	}
	return from, to, nil
}
