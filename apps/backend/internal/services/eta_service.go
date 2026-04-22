package services

import (
	"math"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

const (
	etaRecentSampleSize   = 20
	etaMinSamplesRequired = 3
	// etaEWMAAlpha weights newer completed tickets more heavily in the service-time estimate.
	etaEWMAAlpha = 0.38
	// etaTOD clamp bounds for hourly-vs-overall ratio.
	etaTODClampMin  = 0.75
	etaTODClampMax  = 1.35
	etaLookbackDays = 28
	// etaCounterSamples is how many recent completions per counter feed harmonic throughput.
	etaCounterSamples = 5
)

// ETAService computes estimated wait time and queue position for tickets.
type ETAService struct {
	ticketRepo  repository.TicketRepository
	counterRepo repository.CounterRepository
	serviceRepo repository.ServiceRepository
	unitRepo    repository.UnitRepository
	statsRepo   repository.StatisticsRepository
}

// NewETAService creates a new ETAService.
func NewETAService(ticketRepo repository.TicketRepository, counterRepo repository.CounterRepository) *ETAService {
	return &ETAService{
		ticketRepo:  ticketRepo,
		counterRepo: counterRepo,
	}
}

// NewETAServiceWithServiceRepo creates an ETAService that can also produce per-service breakdowns.
func NewETAServiceWithServiceRepo(ticketRepo repository.TicketRepository, counterRepo repository.CounterRepository, serviceRepo repository.ServiceRepository) *ETAService {
	return &ETAService{
		ticketRepo:  ticketRepo,
		counterRepo: counterRepo,
		serviceRepo: serviceRepo,
	}
}

// NewETAServiceFull wires unit repository for subdivision timezone (time-of-day ETA adjustment).
// statsRepo may be nil; when set, ETA can fall back to statistics_daily_buckets when live samples are sparse.
func NewETAServiceFull(ticketRepo repository.TicketRepository, counterRepo repository.CounterRepository, serviceRepo repository.ServiceRepository, unitRepo repository.UnitRepository, statsRepo repository.StatisticsRepository) *ETAService {
	return &ETAService{
		ticketRepo:  ticketRepo,
		counterRepo: counterRepo,
		serviceRepo: serviceRepo,
		unitRepo:    unitRepo,
		statsRepo:   statsRepo,
	}
}

// EffectiveServiceMinutesForUnit returns the blended service-time estimate in minutes (for staffing / Erlang). Returns 0 when unknown.
func (s *ETAService) EffectiveServiceMinutesForUnit(unitID string) float64 {
	sec, _ := s.effectiveServiceSec(unitID, "", time.Now().UTC())
	if sec <= 0 {
		return 0
	}
	return float64(sec) / 60.0
}

// QueuePositionResult holds position and ETA for a ticket.
type QueuePositionResult struct {
	Position         int `json:"queuePosition"`
	EstimatedWaitSec int `json:"estimatedWaitSeconds"`
}

// TicketETAInfo is per-ticket ETA for WebSocket snapshots.
type TicketETAInfo struct {
	TicketID         string `json:"ticketId"`
	Position         int    `json:"queuePosition"`
	EstimatedWaitSec int    `json:"estimatedWaitSeconds"`
}

// UnitETASnapshot is broadcast on unit.eta_update for real-time clients.
type UnitETASnapshot struct {
	UnitID               string             `json:"unitId"`
	Timestamp            time.Time          `json:"timestamp"`
	QueueLength          int64              `json:"queueLength"`
	EstimatedWaitMinutes float64            `json:"estimatedWaitMinutes"`
	ActiveCounters       int64              `json:"activeCounters"`
	Services             []ServiceQueueInfo `json:"services,omitempty"`
	Tickets              []TicketETAInfo    `json:"tickets,omitempty"`
}

// QueuePositionAndETA computes the 1-based queue position and an estimated wait in seconds
// for a waiting ticket. Returns zeros for non-waiting tickets (no estimation needed).
func (s *ETAService) QueuePositionAndETA(ticket *models.Ticket) (QueuePositionResult, error) {
	if ticket.Status != "waiting" {
		return QueuePositionResult{}, nil
	}

	position, err := s.ticketRepo.GetQueuePosition(ticket)
	if err != nil {
		return QueuePositionResult{}, err
	}

	etaSec := s.estimateWaitSecondsEnhanced(ticket, position)
	return QueuePositionResult{
		Position:         position,
		EstimatedWaitSec: etaSec,
	}, nil
}

// ServiceQueueInfo holds queue stats for a single service within a unit.
type ServiceQueueInfo struct {
	ServiceID            string  `json:"serviceId"`
	ServiceName          string  `json:"serviceName"`
	QueueLength          int64   `json:"queueLength"`
	EstimatedWaitMinutes float64 `json:"estimatedWaitMinutes"`
}

// UnitQueueSummary returns a lightweight summary for the public queue-status endpoint.
type UnitQueueSummary struct {
	QueueLength          int64   `json:"queueLength"`
	EstimatedWaitMinutes float64 `json:"estimatedWaitMinutes"`
	ActiveCounters       int64   `json:"activeCounters"`
	// Services contains per-service breakdown when multiple services have waiting tickets.
	// Omitted when only one service is active (redundant with the top-level fields).
	Services []ServiceQueueInfo `json:"services,omitempty"`
}

// GetUnitQueueSummary returns queue length, estimated wait (minutes), and active counter count
// for a given unit. Intended for unauthenticated public callers.
func (s *ETAService) GetUnitQueueSummary(unitID string) (UnitQueueSummary, error) {
	snap, err := s.ComputeUnitETASnapshot(unitID)
	if err != nil {
		return UnitQueueSummary{}, err
	}
	services := snap.Services
	// Backward-compatible JSON: omit per-service slice when only one queue (same as legacy API).
	if len(services) == 1 {
		services = nil
	}
	out := UnitQueueSummary{
		QueueLength:          snap.QueueLength,
		EstimatedWaitMinutes: snap.EstimatedWaitMinutes,
		ActiveCounters:       snap.ActiveCounters,
		Services:             services,
	}
	return out, nil
}

// ComputeUnitETASnapshot builds queue-wide and per-ticket ETAs for WebSocket push and polling.
func (s *ETAService) ComputeUnitETASnapshot(unitID string) (UnitETASnapshot, error) {
	now := time.Now().UTC()
	queueLength, err := s.ticketRepo.CountWaitingByUnit(unitID)
	if err != nil {
		return UnitETASnapshot{}, err
	}
	activeCounters, err := s.counterRepo.CountActive(unitID)
	if err != nil {
		return UnitETASnapshot{}, err
	}

	perCounter, err := s.ticketRepo.GetAvgServiceSecPerOccupiedCounter(unitID, etaCounterSamples)
	if err != nil {
		perCounter = nil
	}

	var estimatedWaitMinutes float64
	if queueLength > 0 {
		baseSec, _ := s.effectiveServiceSec(unitID, "", now)
		if baseSec > 0 {
			divisor := activeCounters
			if divisor <= 0 {
				divisor = 1
			}
			throughput := harmonicThroughputFromOccupiedSamples(perCounter, baseSec, activeCounters)
			if throughput > 0 {
				estimatedWaitMinutes = (float64(queueLength) / throughput) / 60.0
			} else {
				totalSec := float64(queueLength) * float64(baseSec) / float64(divisor)
				estimatedWaitMinutes = totalSec / 60.0
			}
		}
	}

	snap := UnitETASnapshot{
		UnitID:               unitID,
		Timestamp:            now,
		QueueLength:          queueLength,
		EstimatedWaitMinutes: estimatedWaitMinutes,
		ActiveCounters:       activeCounters,
	}

	waiting, err := s.ticketRepo.GetWaitingTickets(unitID)
	if err != nil {
		return snap, err
	}

	uniqService := make(map[string]struct{}, len(waiting)+1)
	for i := range waiting {
		uniqService[waiting[i].ServiceID] = struct{}{}
	}
	baseSecByService := make(map[string]int, len(uniqService))
	for sid := range uniqService {
		sec, _ := s.effectiveServiceSec(unitID, sid, now)
		baseSecByService[sid] = sec
	}

	throughputByBase := make(map[int]float64)
	for i := range waiting {
		t := &waiting[i]
		pos := i + 1
		baseSec := baseSecByService[t.ServiceID]
		var thr float64
		if baseSec > 0 {
			var have bool
			thr, have = throughputByBase[baseSec]
			if !have {
				thr = harmonicThroughputFromOccupiedSamples(perCounter, baseSec, activeCounters)
				throughputByBase[baseSec] = thr
			}
		}
		etaSec := estimateWaitSecondsFromInputs(t, pos, baseSec, activeCounters, thr)
		snap.Tickets = append(snap.Tickets, TicketETAInfo{
			TicketID:         t.ID,
			Position:         pos,
			EstimatedWaitSec: etaSec,
		})
	}

	if s.serviceRepo != nil {
		perService, sErr := s.ticketRepo.CountWaitingByService(unitID)
		if sErr == nil && len(perService) > 0 {
			serviceMap, mErr := s.serviceRepo.FindMapByIDs(func() []string {
				ids := make([]string, len(perService))
				for i, p := range perService {
					ids[i] = p.ServiceID
				}
				return ids
			}())
			baseSecCache := make(map[string]int, len(perService))
			for _, sc := range perService {
				if sc.Count <= 0 {
					continue
				}
				info := ServiceQueueInfo{
					ServiceID:   sc.ServiceID,
					QueueLength: sc.Count,
				}
				if mErr == nil {
					if svc, ok := serviceMap[sc.ServiceID]; ok {
						info.ServiceName = svc.Name
					}
				}
				baseSec, have := baseSecCache[sc.ServiceID]
				if !have {
					baseSec, _ = s.effectiveServiceSec(unitID, sc.ServiceID, now)
					baseSecCache[sc.ServiceID] = baseSec
				}
				if baseSec > 0 {
					divisor := activeCounters
					if divisor <= 0 {
						divisor = 1
					}
					thr, haveThr := throughputByBase[baseSec]
					if !haveThr {
						thr = harmonicThroughputFromOccupiedSamples(perCounter, baseSec, activeCounters)
						throughputByBase[baseSec] = thr
					}
					if thr > 0 {
						info.EstimatedWaitMinutes = float64(sc.Count) / thr / 60.0
					} else {
						info.EstimatedWaitMinutes = float64(sc.Count) * float64(baseSec) / float64(divisor) / 60.0
					}
				}
				snap.Services = append(snap.Services, info)
			}
		}
	}

	return snap, nil
}

func ewmaSeconds(samples []int, alpha float64) int {
	if len(samples) == 0 {
		return 0
	}
	if alpha <= 0 || alpha > 1 {
		alpha = etaEWMAAlpha
	}
	// Repository returns newest-first; process oldest-first for EWMA.
	for i, j := 0, len(samples)-1; i < j; i, j = i+1, j-1 {
		samples[i], samples[j] = samples[j], samples[i]
	}
	e := float64(samples[0])
	for i := 1; i < len(samples); i++ {
		e = alpha*float64(samples[i]) + (1-alpha)*e
	}
	return int(math.Round(e))
}

func (s *ETAService) timeOfDayMultiplier(unitID string, now time.Time) float64 {
	if s.unitRepo == nil {
		return 1
	}
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil || u == nil {
		return 1
	}
	tzName := strings.TrimSpace(u.Timezone)
	if tzName == "" {
		tzName = "UTC"
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	local := now.In(loc)
	hour := local.Hour()
	wd := local.Weekday()

	hourly, overall, err := s.ticketRepo.GetServiceTimeHourlyVsOverall(unitID, tzName, hour, wd, etaLookbackDays)
	if err != nil || overall <= 0 || hourly <= 0 {
		return 1
	}
	ratio := hourly / overall
	if ratio < etaTODClampMin {
		ratio = etaTODClampMin
	}
	if ratio > etaTODClampMax {
		ratio = etaTODClampMax
	}
	return ratio
}

// effectiveServiceSec returns service duration estimate (seconds) with EWMA and time-of-day adjustment.
func (s *ETAService) effectiveServiceSec(unitID, serviceID string, now time.Time) (int, float64) {
	samples, err := s.ticketRepo.GetRecentCompletedServiceTimes(unitID, serviceID, etaRecentSampleSize)
	if err != nil {
		samples = nil
	}
	var sec int
	if len(samples) >= etaMinSamplesRequired {
		cp := append([]int(nil), samples...)
		sec = ewmaSeconds(cp, etaEWMAAlpha)
	}
	if sec <= 0 && serviceID != "" {
		unitWide, err2 := s.ticketRepo.GetRecentCompletedServiceTimes(unitID, "", etaRecentSampleSize)
		if err2 == nil && len(unitWide) >= etaMinSamplesRequired {
			cp := append([]int(nil), unitWide...)
			sec = ewmaSeconds(cp, etaEWMAAlpha)
		}
	}
	tod := s.timeOfDayMultiplier(unitID, now)
	if sec > 0 {
		return int(math.Round(float64(sec) * tod)), tod
	}
	// Fallback: warehouse daily buckets when live ticket samples are too thin.
	if s.statsRepo != nil {
		if bucketSec, ok, err := s.statsRepo.AvgServiceSecSubdivisionRollup(unitID, etaLookbackDays); err == nil && ok && bucketSec > 0 {
			return int(math.Round(bucketSec * tod)), tod
		}
	}
	// Fallback: historical averages from raw tickets when EWMA has insufficient data.
	tz := s.resolveTZ(unitID)
	loc, lerr := time.LoadLocation(tz)
	if lerr != nil || loc == nil {
		loc = time.UTC
	}
	local := now.In(loc)
	hourly, overall, herr := s.ticketRepo.GetServiceTimeHourlyVsOverall(unitID, tz, local.Hour(), local.Weekday(), etaLookbackDays)
	if herr != nil {
		return 0, tod
	}
	if hourly > 0 {
		return int(math.Round(hourly)), tod
	}
	if overall > 0 {
		return int(math.Round(overall * tod)), tod
	}
	return 0, tod
}

func (s *ETAService) resolveTZ(unitID string) string {
	if s.unitRepo == nil {
		return "UTC"
	}
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil || u == nil {
		return "UTC"
	}
	tz := strings.TrimSpace(u.Timezone)
	if tz == "" {
		return "UTC"
	}
	return tz
}

// harmonicThroughputFromOccupiedSamples aggregates completions/sec from per-counter averages when present;
// otherwise falls back to activeCounters/fallbackBaseSec. Used to avoid repeated DB reads in snapshots.
func harmonicThroughputFromOccupiedSamples(perCounter map[string]float64, fallbackBaseSec int, activeCounters int64) float64 {
	if activeCounters <= 0 {
		activeCounters = 1
	}
	if len(perCounter) == 0 {
		if fallbackBaseSec <= 0 {
			return 0
		}
		return float64(activeCounters) / float64(fallbackBaseSec)
	}
	var sumInverse float64
	for _, avg := range perCounter {
		if avg > 0 {
			sumInverse += 1.0 / avg
		}
	}
	if sumInverse <= 0 {
		if fallbackBaseSec <= 0 {
			return 0
		}
		return float64(activeCounters) / float64(fallbackBaseSec)
	}
	return sumInverse
}

func (s *ETAService) harmonicThroughputPerSec(unitID string, fallbackBaseSec int, activeCounters int64) float64 {
	perCounter, err := s.ticketRepo.GetAvgServiceSecPerOccupiedCounter(unitID, etaCounterSamples)
	if err != nil {
		perCounter = nil
	}
	return harmonicThroughputFromOccupiedSamples(perCounter, fallbackBaseSec, activeCounters)
}

func estimateWaitSecondsFromInputs(ticket *models.Ticket, position int, baseSec int, activeCounters int64, throughput float64) int {
	if ticket.Status != "waiting" || position <= 0 {
		return 0
	}
	if baseSec <= 0 {
		if ticket.MaxWaitingTime != nil && *ticket.MaxWaitingTime > 0 {
			return *ticket.MaxWaitingTime
		}
		return 0
	}
	if activeCounters <= 0 {
		activeCounters = 1
	}
	if throughput > 0 {
		return int(math.Round(float64(position) / throughput))
	}
	return (position * baseSec) / int(activeCounters)
}

func (s *ETAService) estimateWaitSecondsEnhanced(ticket *models.Ticket, position int) int {
	now := time.Now().UTC()
	baseSec, _ := s.effectiveServiceSec(ticket.UnitID, ticket.ServiceID, now)
	activeCounters, err := s.counterRepo.CountActive(ticket.UnitID)
	if err != nil || activeCounters <= 0 {
		activeCounters = 1
	}
	perCounter, err := s.ticketRepo.GetAvgServiceSecPerOccupiedCounter(ticket.UnitID, etaCounterSamples)
	if err != nil {
		perCounter = nil
	}
	throughput := harmonicThroughputFromOccupiedSamples(perCounter, baseSec, activeCounters)
	return estimateWaitSecondsFromInputs(ticket, position, baseSec, activeCounters, throughput)
}
