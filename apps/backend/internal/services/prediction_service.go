package services

import (
	"context"
	"database/sql"
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

	p.mu.Lock()
	if last, ok := p.lastStaff[unitID]; ok && time.Since(last) < p.cooldown {
		p.mu.Unlock()
		return
	}
	p.mu.Unlock()

	summary, err := p.eta.GetUnitQueueSummary(unitID)
	if err != nil {
		return
	}
	if summary.QueueLength == 0 {
		return
	}

	slaMinSec := p.strictestWaitSLASec(unitID)
	if slaMinSec == nil {
		p.maybeHeuristicStaffingAlert(unitID, summary)
		return
	}

	slaMin := float64(*slaMinSec) / 60.0
	if slaMin <= 0 {
		p.maybeHeuristicStaffingAlert(unitID, summary)
		return
	}

	since1h := time.Now().UTC().Add(-time.Hour)
	arrivals1h, err := p.ticketRepo.CountTicketsCreatedSince(unitID, since1h)
	if err != nil {
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

	p.mu.Lock()
	p.lastStaff[unitID] = time.Now()
	p.mu.Unlock()
}

func (p *PredictionService) strictestWaitSLASec(unitID string) *int {
	tickets, err := p.ticketRepo.GetWaitingTicketsWithSLA(unitID)
	if err != nil || len(tickets) == 0 {
		waiting, werr := p.ticketRepo.GetWaitingTickets(unitID)
		if werr != nil {
			return nil
		}
		var best *int
		for i := range waiting {
			t := &waiting[i]
			if t.MaxWaitingTime != nil && *t.MaxWaitingTime > 0 {
				if best == nil || *t.MaxWaitingTime < *best {
					v := *t.MaxWaitingTime
					best = &v
				}
			}
		}
		return best
	}
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

func (p *PredictionService) maybeHeuristicStaffingAlert(unitID string, summary UnitQueueSummary) {
	if summary.EstimatedWaitMinutes < 12 {
		return
	}
	if summary.ActiveCounters >= 4 {
		return
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
func (a *AnomalyService) RunPeriodicCheck(ctx context.Context) {
	if a == nil || a.db == nil {
		return
	}
	var ids []string
	if err := a.db.WithContext(ctx).Model(&models.Unit{}).
		Where("kind = ?", models.UnitKindSubdivision).
		Pluck("id", &ids).Error; err != nil {
		return
	}
	for _, id := range ids {
		a.checkUnit(ctx, id)
	}
}

func (a *AnomalyService) checkUnit(ctx context.Context, unitID string) {
	u, err := a.unitRepo.FindByIDLight(unitID)
	if err != nil || u == nil {
		return
	}
	ok, err := CompanyAllowsAdvancedReports(ctx, a.db, u.CompanyID)
	if err != nil || !ok {
		return
	}

	a.mu.Lock()
	if last, ok := a.last[unitID]; ok && time.Since(last) < a.cooldown {
		a.mu.Unlock()
		return
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
		return
	}

	normArrivals := a.avgTicketsCreatedSameHourWeekday(ctx, unitID, tz)
	if normArrivals >= 3 && float64(lastHour) > 2.0*normArrivals {
		a.emit(ctx, unitID, "arrival_spike", "Ticket arrivals in the last hour are much higher than the usual level for this hour and weekday.")
		return
	}

	var lastHourNoShow int64
	if err := a.db.WithContext(ctx).Raw(`
SELECT COUNT(*) FROM tickets WHERE unit_id = ? AND is_eod = false AND status = 'no_show'
  AND completed_at IS NOT NULL AND completed_at >= NOW() - INTERVAL '1 hour'
`, unitID).Scan(&lastHourNoShow).Error; err != nil {
		return
	}
	normNoShow := a.avgNoShowSameHourWeekday(ctx, unitID, tz)
	if normNoShow >= 1 && float64(lastHourNoShow) > 3.0*normNoShow {
		a.emit(ctx, unitID, "mass_no_show", "No-show completions in the last hour are much higher than the usual level for this hour and weekday.")
		return
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
    AND completed_at >= NOW() - INTERVAL '24 hours'
)
SELECT CASE WHEN day.v > 0 AND last_hour.v > 0 THEN last_hour.v / day.v ELSE 0 END
FROM last_hour, day
`, unitID, unitID).Scan(&slowRatio).Error; err != nil {
		return
	}
	if slowRatio > 2.0 {
		a.emit(ctx, unitID, "slow_service", "Average service duration in the last hour is much higher than the recent baseline.")
	}
}

func (a *AnomalyService) avgTicketsCreatedSameHourWeekday(ctx context.Context, unitID, tz string) float64 {
	var v sql.NullFloat64
	q := `
SELECT AVG(daily_cnt) FROM (
  SELECT COUNT(*)::float AS daily_cnt
  FROM tickets t
  WHERE t.unit_id::text = ?
    AND t.is_eod = false
    AND (t.created_at AT TIME ZONE ?)::date < (CURRENT_TIMESTAMP AT TIME ZONE ?)::date
    AND EXTRACT(DOW FROM (t.created_at AT TIME ZONE ?)) = EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
    AND EXTRACT(HOUR FROM (t.created_at AT TIME ZONE ?)) = EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
  GROUP BY (t.created_at AT TIME ZONE ?)::date
) sub
`
	if err := a.db.WithContext(ctx).Raw(q, unitID, tz, tz, tz, tz, tz, tz, tz).Scan(&v).Error; err != nil || !v.Valid {
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
  WHERE t.unit_id::text = ?
    AND t.is_eod = false
    AND t.status = 'no_show'
    AND t.completed_at IS NOT NULL
    AND (t.completed_at AT TIME ZONE ?)::date < (CURRENT_TIMESTAMP AT TIME ZONE ?)::date
    AND EXTRACT(DOW FROM (t.completed_at AT TIME ZONE ?)) = EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
    AND EXTRACT(HOUR FROM (t.completed_at AT TIME ZONE ?)) = EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE ?))
  GROUP BY (t.completed_at AT TIME ZONE ?)::date
) sub
`
	if err := a.db.WithContext(ctx).Raw(q, unitID, tz, tz, tz, tz, tz, tz, tz).Scan(&v).Error; err != nil || !v.Valid {
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
		_ = a.alertRepo.Create(ctx, row)
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
