package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"

	"gorm.io/gorm"
)

// PredictionService emits realtime staffing hints (WebSocket unit.staffing_alert) for advanced_reports tenants.
type PredictionService struct {
	db         *gorm.DB
	hub        *ws.Hub
	eta        *ETAService
	unitRepo   repository.UnitRepository
	ticketRepo repository.TicketRepository
	mu         sync.Mutex
	lastStaff  map[string]time.Time
	cooldown   time.Duration
}

// NewPredictionService creates a staffing alert helper. hub or eta may be nil (no-op).
func NewPredictionService(db *gorm.DB, hub *ws.Hub, eta *ETAService, unitRepo repository.UnitRepository, ticketRepo repository.TicketRepository) *PredictionService {
	return &PredictionService{
		db:         db,
		hub:        hub,
		eta:        eta,
		unitRepo:   unitRepo,
		ticketRepo: ticketRepo,
		lastStaff:  make(map[string]time.Time),
		cooldown:   3 * time.Minute,
	}
}

// MaybeBroadcastStaffingAlert evaluates queue pressure using wait SLA (when configured), Erlang C on current λ/μ, and may emit unit.staffing_alert (cooldown per unit).
func (p *PredictionService) MaybeBroadcastStaffingAlert(ctx context.Context, unitID string) {
	if p == nil || p.hub == nil || p.eta == nil || p.db == nil || p.unitRepo == nil || p.ticketRepo == nil {
		return
	}
	unitID = strings.TrimSpace(unitID)
	if unitID == "" {
		return
	}

	u, err := p.unitRepo.FindByIDLight(unitID)
	if err != nil || u == nil {
		return
	}
	ok, err := CompanyAllowsAdvancedReports(ctx, p.db, u.CompanyID)
	if err != nil || !ok {
		return
	}

	// Reserve cooldown slot so concurrent callers do not all pass the guard; release if we exit without broadcasting.
	p.mu.Lock()
	if last, okc := p.lastStaff[unitID]; okc && time.Since(last) < p.cooldown {
		p.mu.Unlock()
		return
	}
	p.lastStaff[unitID] = time.Now()
	p.mu.Unlock()

	broadcasted := false
	defer func() {
		if !broadcasted {
			p.mu.Lock()
			delete(p.lastStaff, unitID)
			p.mu.Unlock()
		}
	}()

	summary, err := p.eta.GetUnitQueueSummary(unitID)
	if err != nil {
		return
	}
	if summary.QueueLength == 0 {
		return
	}

	slaMinSec := p.strictestWaitSLASec(unitID)
	if slaMinSec == nil {
		if p.maybeHeuristicStaffingAlert(unitID, summary) {
			broadcasted = true
		}
		return
	}

	slaMin := float64(*slaMinSec) / 60.0
	if slaMin <= 0 {
		if p.maybeHeuristicStaffingAlert(unitID, summary) {
			broadcasted = true
		}
		return
	}

	since1h := time.Now().UTC().Add(-time.Hour)
	arrivals1h, err := p.ticketRepo.CountTicketsCreatedSince(unitID, since1h)
	if err != nil {
		slog.Debug("CountTicketsCreatedSince failed, using 0 for arrivals rate", "unit", unitID, "err", err)
		arrivals1h = 0
	}
	lambdaPerMin := float64(arrivals1h) / 60.0
	if lambdaPerMin <= 0 && summary.EstimatedWaitMinutes > 0 && summary.QueueLength > 0 {
		lambdaPerMin = float64(summary.QueueLength) / (summary.EstimatedWaitMinutes * 60.0)
	}

	avgSvcMin := p.eta.EffectiveServiceMinutesForUnit(unitID)
	if avgSvcMin <= 0 {
		avgSvcMin = 5.0
	}
	muPerAgent := 1.0 / avgSvcMin
	n := int(summary.ActiveCounters)
	if n < 1 {
		n = 1
	}

	need := erlangCMinAgents(lambdaPerMin, muPerAgent, 0.90, slaMin)
	extra := need - n
	if extra < 0 {
		extra = 0
	}
	if extra > 8 {
		extra = 8
	}

	curSLA := erlangCSLA(lambdaPerMin, muPerAgent, n, slaMin)
	headroomMin := slaMin - summary.EstimatedWaitMinutes

	shouldAlert := summary.EstimatedWaitMinutes >= slaMin*0.92 || need > n || curSLA < 0.82
	if !shouldAlert {
		return
	}
	if extra == 0 && summary.EstimatedWaitMinutes < 12 && summary.ActiveCounters >= 4 && curSLA >= 0.88 && headroomMin >= 5 {
		return
	}

	minutesToBreach := headroomMin
	if minutesToBreach < 0 {
		minutesToBreach = 0
	}

	payload := map[string]interface{}{
		"unitId":                   unitID,
		"kind":                     "sla_pressure",
		"message":                  "Queue pressure may breach wait-time SLA; consider opening more counters.",
		"recommendedExtraCounters": extra,
		"slaMaxWaitMinutes":        math.Round(slaMin*10) / 10,
		"estimatedWaitMinutes":     math.Round(summary.EstimatedWaitMinutes*10) / 10,
		"minutesHeadroom":          math.Round(minutesToBreach*10) / 10,
		"predictedSlaBreachInMin":  math.Round(minutesToBreach*10) / 10,
		"erlangSlaPct":             math.Round(curSLA*1000) / 10,
		"erlangAgentsRecommended":  need,
	}

	p.hub.BroadcastEvent("unit.staffing_alert", payload, unitID)
	broadcasted = true
	p.mu.Lock()
	p.lastStaff[unitID] = time.Now()
	p.mu.Unlock()
}

func minPositiveMaxWaitingSec(tickets []models.Ticket) *int {
	var best *int
	for i := range tickets {
		t := &tickets[i]
		if t.MaxWaitingTime != nil && *t.MaxWaitingTime > 0 {
			if best == nil || *t.MaxWaitingTime < *best {
				v := *t.MaxWaitingTime
				best = &v
			}
		}
	}
	return best
}

func (p *PredictionService) strictestWaitSLASec(unitID string) *int {
	tickets, err := p.ticketRepo.GetWaitingTicketsWithSLA(unitID)
	if err != nil {
		return nil
	}
	if len(tickets) > 0 {
		return minPositiveMaxWaitingSec(tickets)
	}
	waiting, werr := p.ticketRepo.GetWaitingTickets(unitID)
	if werr != nil {
		return nil
	}
	return minPositiveMaxWaitingSec(waiting)
}

func (p *PredictionService) maybeHeuristicStaffingAlert(unitID string, summary UnitQueueSummary) bool {
	if summary.EstimatedWaitMinutes < 12 {
		return false
	}
	if summary.ActiveCounters >= 4 {
		return false
	}
	extra := int64(1)
	if summary.EstimatedWaitMinutes > 25 {
		extra = 2
	}
	payload := map[string]interface{}{
		"unitId":                   unitID,
		"kind":                     "high_wait",
		"message":                  "Queue wait is projected to stay high; consider opening more counters.",
		"recommendedExtraCounters": extra,
		"estimatedWaitMinutes":     summary.EstimatedWaitMinutes,
	}
	p.hub.BroadcastEvent("unit.staffing_alert", payload, unitID)
	p.mu.Lock()
	p.lastStaff[unitID] = time.Now()
	p.mu.Unlock()
	return true
}

// --- Anomaly detection (called from periodic job) ---

// AnomalyService detects unusual queue patterns and broadcasts unit.anomaly_alert.
type AnomalyService struct {
	db        *gorm.DB
	hub       *ws.Hub
	unitRepo  repository.UnitRepository
	alertRepo repository.AnomalyAlertRepository
	mu        sync.Mutex
	last      map[string]time.Time
	cooldown  time.Duration
}

// NewAnomalyService creates an anomaly detector. hub may be nil; alertRepo may be nil (WS only).
func NewAnomalyService(db *gorm.DB, hub *ws.Hub, unitRepo repository.UnitRepository, alertRepo repository.AnomalyAlertRepository) *AnomalyService {
	return &AnomalyService{
		db:        db,
		hub:       hub,
		unitRepo:  unitRepo,
		alertRepo: alertRepo,
		last:      make(map[string]time.Time),
		cooldown:  10 * time.Minute,
	}
}

// RunPeriodicCheck scans subdivision units for spike / slow-service / mass no-show anomalies.
func (a *AnomalyService) RunPeriodicCheck(ctx context.Context) error {
	if a == nil || a.db == nil {
		return nil
	}
	var ids []string
	if err := a.db.WithContext(ctx).Model(&models.Unit{}).
		Where("kind = ?", models.UnitKindSubdivision).
		Pluck("id", &ids).Error; err != nil {
		return fmt.Errorf("anomaly periodic: list subdivisions: %w", err)
	}
	var unitErrs []error
	for _, id := range ids {
		if err := a.checkUnit(ctx, id); err != nil {
			slog.Error("anomaly check unit failed", "unit", id, "err", err)
			unitErrs = append(unitErrs, fmt.Errorf("unit %s: %w", id, err))
		}
	}
	if len(unitErrs) > 0 {
		return errors.Join(unitErrs...)
	}
	return nil
}

func (a *AnomalyService) checkUnit(ctx context.Context, unitID string) error {
	u, err := a.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return fmt.Errorf("anomaly check unit %s: load unit: %w", unitID, err)
	}
	if u == nil {
		return nil
	}
	ok, err := CompanyAllowsAdvancedReports(ctx, a.db, u.CompanyID)
	if err != nil {
		return fmt.Errorf("anomaly check unit %s: plan feature: %w", unitID, err)
	}
	if !ok {
		return nil
	}

	a.mu.Lock()
	if last, ok := a.last[unitID]; ok && time.Since(last) < a.cooldown {
		a.mu.Unlock()
		return nil
	}
	a.mu.Unlock()

	tz := strings.TrimSpace(u.Timezone)
	if tz == "" {
		tz = "UTC"
	}

	var lastHour int64
	if err := a.db.WithContext(ctx).Raw(`
SELECT COUNT(*) FROM tickets WHERE unit_id = ? AND is_eod = false AND created_at >= NOW() - INTERVAL '1 hour'
`, unitID).Scan(&lastHour).Error; err != nil {
		return fmt.Errorf("anomaly check unit %s: last hour arrivals: %w", unitID, err)
	}

	normArrivals := a.avgTicketsCreatedSameHourWeekday(ctx, unitID, tz)
	if normArrivals >= 3 && float64(lastHour) > 2.0*normArrivals {
		a.emit(ctx, unitID, "arrival_spike", "Ticket arrivals in the last hour are much higher than the usual level for this hour and weekday.")
		return nil
	}

	var lastHourNoShow int64
	if err := a.db.WithContext(ctx).Raw(`
SELECT COUNT(*) FROM tickets WHERE unit_id = ? AND is_eod = false AND status = 'no_show'
  AND completed_at IS NOT NULL AND completed_at >= NOW() - INTERVAL '1 hour'
`, unitID).Scan(&lastHourNoShow).Error; err != nil {
		return fmt.Errorf("anomaly check unit %s: last hour no-show: %w", unitID, err)
	}
	normNoShow := a.avgNoShowSameHourWeekday(ctx, unitID, tz)
	if normNoShow >= 1 && float64(lastHourNoShow) > 3.0*normNoShow {
		a.emit(ctx, unitID, "mass_no_show", "No-show completions in the last hour are much higher than the usual level for this hour and weekday.")
		return nil
	}

	var slowRatio float64
	if err := a.db.WithContext(ctx).Raw(`
WITH last_hour AS (
  SELECT AVG(EXTRACT(EPOCH FROM (completed_at - confirmed_at))) AS v
  FROM tickets
  WHERE unit_id = ? AND status = 'served' AND confirmed_at IS NOT NULL AND completed_at IS NOT NULL
    AND completed_at >= NOW() - INTERVAL '1 hour'
), day AS (
  SELECT AVG(EXTRACT(EPOCH FROM (completed_at - confirmed_at))) AS v
  FROM tickets
  WHERE unit_id = ? AND status = 'served' AND confirmed_at IS NOT NULL AND completed_at IS NOT NULL
    AND completed_at >= NOW() - INTERVAL '24 hours' AND completed_at < NOW() - INTERVAL '1 hour'
)
SELECT CASE WHEN day.v > 0 AND last_hour.v > 0 THEN last_hour.v / day.v ELSE 0 END
FROM last_hour, day
`, unitID, unitID).Scan(&slowRatio).Error; err != nil {
		return fmt.Errorf("anomaly check unit %s: slow service ratio: %w", unitID, err)
	}
	if slowRatio > 2.0 {
		a.emit(ctx, unitID, "slow_service", "Average service duration in the last hour is much higher than the recent baseline.")
	}
	return nil
}

func (a *AnomalyService) avgTicketsCreatedSameHourWeekday(ctx context.Context, unitID, tz string) float64 {
	var v sql.NullFloat64
	q := `
SELECT AVG(daily_cnt) FROM (
  SELECT COUNT(*)::float AS daily_cnt
  FROM tickets t
  WHERE t.unit_id = ?
    AND t.is_eod = false
    AND (t.created_at AT TIME ZONE ?) >= ((CURRENT_TIMESTAMP AT TIME ZONE ?) - INTERVAL '56 days')
    AND (t.created_at AT TIME ZONE ?)::date < (CURRENT_TIMESTAMP AT TIME ZONE ?)::date
    AND EXTRACT(DOW FROM (t.created_at AT TIME ZONE ?)) = EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
    AND EXTRACT(HOUR FROM (t.created_at AT TIME ZONE ?)) = EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
  GROUP BY (t.created_at AT TIME ZONE ?)::date
) sub
`
	if err := a.db.WithContext(ctx).Raw(q, unitID, tz, tz, tz, tz, tz, tz, tz, tz, tz).Scan(&v).Error; err != nil || !v.Valid {
		return 0
	}
	return v.Float64
}

func (a *AnomalyService) avgNoShowSameHourWeekday(ctx context.Context, unitID, tz string) float64 {
	var v sql.NullFloat64
	q := `
SELECT AVG(daily_cnt) FROM (
  SELECT COUNT(*)::float AS daily_cnt
  FROM tickets t
  WHERE t.unit_id = ?
    AND t.is_eod = false
    AND t.status = 'no_show'
    AND t.completed_at IS NOT NULL
    AND (t.completed_at AT TIME ZONE ?) >= ((CURRENT_TIMESTAMP AT TIME ZONE ?) - INTERVAL '56 days')
    AND (t.completed_at AT TIME ZONE ?)::date < (CURRENT_TIMESTAMP AT TIME ZONE ?)::date
    AND EXTRACT(DOW FROM (t.completed_at AT TIME ZONE ?)) = EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
    AND EXTRACT(HOUR FROM (t.completed_at AT TIME ZONE ?)) = EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
  GROUP BY (t.completed_at AT TIME ZONE ?)::date
) sub
`
	if err := a.db.WithContext(ctx).Raw(q, unitID, tz, tz, tz, tz, tz, tz, tz, tz, tz).Scan(&v).Error; err != nil || !v.Valid {
		return 0
	}
	return v.Float64
}

func (a *AnomalyService) emit(ctx context.Context, unitID, kind, msg string) {
	row := &models.AnomalyAlert{
		UnitID:    unitID,
		Kind:      kind,
		Message:   msg,
		Severity:  "warning",
		CreatedAt: time.Now().UTC(),
	}
	if a.alertRepo != nil {
		if err := a.alertRepo.Create(ctx, row); err != nil {
			slog.Error("anomaly alert persist failed", "unit", unitID, "kind", kind, "err", err)
			// Still advance last-seen: otherwise the next check retries immediately and spams logs when storage is down.
			a.mu.Lock()
			a.last[unitID] = time.Now()
			a.mu.Unlock()
			return
		}
	}
	if a.hub == nil {
		a.mu.Lock()
		a.last[unitID] = time.Now()
		a.mu.Unlock()
		return
	}
	payload := map[string]interface{}{
		"unitId":   unitID,
		"kind":     kind,
		"message":  msg,
		"severity": "warning",
	}
	if row.ID != "" {
		payload["id"] = row.ID
	}
	a.hub.BroadcastEvent("unit.anomaly_alert", payload, unitID)
	a.mu.Lock()
	a.last[unitID] = time.Now()
	a.mu.Unlock()
}
