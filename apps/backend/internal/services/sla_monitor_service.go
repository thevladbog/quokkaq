package services

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"
)

const (
	// SLA alert threshold percentages.
	slaThreshold50  = 50
	slaThreshold80  = 80
	slaThreshold100 = 100

	// WS event names — wait SLA (queue).
	eventSlaWarning = "unit.sla_warning"
	eventSlaBreach  = "unit.sla_breach"

	// WS event names — service-time SLA (at desk).
	eventServiceSlaWarning = "unit.service_sla_warning"
	eventServiceSlaBreach  = "unit.service_sla_breach"

	// AlertType values sent in SlaAlertPayload.
	alertTypeWait    = "wait"
	alertTypeService = "service"

	// State key prefixes to keep wait and service SLA entries separate.
	stateKeyPrefixWait    = "w:"
	stateKeyPrefixService = "s:"

	defaultSlaMonitorIntervalSec = 10
)

// SlaAlertPayload is the data envelope sent with unit.sla_warning, unit.sla_breach,
// unit.service_sla_warning, and unit.service_sla_breach WS events.
type SlaAlertPayload struct {
	TicketID       string `json:"ticketId"`
	QueueNumber    string `json:"queueNumber"`
	ServiceName    string `json:"serviceName"`
	UnitID         string `json:"unitId"`
	ThresholdPct   int    `json:"thresholdPct"` // 50, 80, or 100
	ElapsedSec     int    `json:"elapsedSec"`
	MaxWaitTimeSec int    `json:"maxWaitTimeSec"`
	// AlertType distinguishes wait-queue SLA ("wait") from service-time SLA ("service").
	AlertType string `json:"alertType"`
}

// slaTicketState tracks which threshold was last emitted for a (ticket, alertType) pair
// so we only fire each crossing once.
type slaTicketState struct {
	lastThreshold int // 0 = nothing emitted yet
}

// SlaMonitorService checks waiting and in_service tickets against their SLA thresholds
// on a regular tick and broadcasts WS events when a threshold is first crossed.
type SlaMonitorService struct {
	ticketRepo repository.TicketRepository
	hub        *ws.Hub

	mu    sync.Mutex
	state map[string]*slaTicketState // keyed by "w:<ticketID>" or "s:<ticketID>"
}

// NewSlaMonitorService creates a new SLA monitor.
func NewSlaMonitorService(ticketRepo repository.TicketRepository, hub *ws.Hub) *SlaMonitorService {
	return &SlaMonitorService{
		ticketRepo: ticketRepo,
		hub:        hub,
		state:      make(map[string]*slaTicketState),
	}
}

// Start launches the periodic SLA monitor goroutine. It exits when ctx is cancelled.
// Interval defaults to 10 s; override with env SLA_MONITOR_INTERVAL_SEC.
// The monitor is a no-op when env SLA_MONITOR_ENABLED=false.
func (s *SlaMonitorService) Start(ctx context.Context) {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("SLA_MONITOR_ENABLED")), "false") {
		slog.Info("SLA monitor disabled via SLA_MONITOR_ENABLED=false")
		return
	}

	sec := defaultSlaMonitorIntervalSec
	if v := strings.TrimSpace(os.Getenv("SLA_MONITOR_INTERVAL_SEC")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			sec = n
		}
	}

	go func() {
		ticker := time.NewTicker(time.Duration(sec) * time.Second)
		defer ticker.Stop()

		// Run once immediately so the first interval is not a blind spot.
		s.tick()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.tick()
			}
		}
	}()
}

// tick is the core per-interval logic. It fetches waiting and in_service SLA tickets
// for every active WS room and emits events for newly crossed thresholds.
func (s *SlaMonitorService) tick() {
	rooms := s.hub.ActiveRooms()
	if len(rooms) == 0 {
		return
	}

	now := time.Now()
	seenStateKeys := make(map[string]struct{}, 128)
	hadRepoError := false

	for _, unitID := range rooms {
		// --- Wait SLA (waiting tickets) ---
		waitTickets, err := s.ticketRepo.GetWaitingTicketsWithSLA(unitID)
		if err != nil {
			hadRepoError = true
			slog.Error("sla monitor: GetWaitingTicketsWithSLA", "unit_id", unitID, "err", err)
		} else {
			for i := range waitTickets {
				t := &waitTickets[i]
				key := stateKeyPrefixWait + t.ID
				seenStateKeys[key] = struct{}{}
				s.evaluateWaitSLA(t, now, key)
			}
		}

		// --- Service-time SLA (in_service tickets) ---
		svcTickets, err := s.ticketRepo.GetInServiceTicketsWithSLA(unitID)
		if err != nil {
			hadRepoError = true
			slog.Error("sla monitor: GetInServiceTicketsWithSLA", "unit_id", unitID, "err", err)
		} else {
			for i := range svcTickets {
				t := &svcTickets[i]
				key := stateKeyPrefixService + t.ID
				seenStateKeys[key] = struct{}{}
				s.evaluateServiceSLA(t, now, key)
			}
		}
	}

	// Skip eviction on transient repo failures to avoid clearing dedupe state.
	if hadRepoError {
		return
	}

	// Evict state for tickets no longer tracked.
	s.mu.Lock()
	for key := range s.state {
		if _, active := seenStateKeys[key]; !active {
			delete(s.state, key)
		}
	}
	s.mu.Unlock()
}

// evaluateWaitSLA checks a waiting ticket against its MaxWaitingTime SLA.
func (s *SlaMonitorService) evaluateWaitSLA(t *models.Ticket, now time.Time, stateKey string) {
	if t.MaxWaitingTime == nil || *t.MaxWaitingTime <= 0 {
		return
	}

	elapsedSec := int(now.Sub(t.CreatedAt).Seconds())
	if elapsedSec < 0 {
		elapsedSec = 0
	}
	maxSec := *t.MaxWaitingTime

	pct := (elapsedSec * 100) / maxSec
	threshold := s.currentThreshold(pct)
	if threshold == 0 {
		return
	}

	if !s.shouldEmit(stateKey, threshold) {
		return
	}

	payload := SlaAlertPayload{
		TicketID:       t.ID,
		QueueNumber:    t.QueueNumber,
		ServiceName:    resolveServiceName(t),
		UnitID:         t.UnitID,
		ThresholdPct:   threshold,
		ElapsedSec:     elapsedSec,
		MaxWaitTimeSec: maxSec,
		AlertType:      alertTypeWait,
	}

	eventName := eventSlaWarning
	if threshold >= slaThreshold100 {
		eventName = eventSlaBreach
	}
	s.hub.BroadcastEvent(eventName, payload, t.UnitID)
}

// evaluateServiceSLA checks an in_service ticket against its MaxServiceTime SLA.
func (s *SlaMonitorService) evaluateServiceSLA(t *models.Ticket, now time.Time, stateKey string) {
	if t.MaxServiceTime == nil || *t.MaxServiceTime <= 0 || t.ConfirmedAt == nil {
		return
	}

	elapsedSec := int(now.Sub(*t.ConfirmedAt).Seconds())
	if elapsedSec < 0 {
		elapsedSec = 0
	}
	maxSec := *t.MaxServiceTime

	pct := (elapsedSec * 100) / maxSec
	threshold := s.currentThreshold(pct)
	if threshold == 0 {
		return
	}

	if !s.shouldEmit(stateKey, threshold) {
		return
	}

	payload := SlaAlertPayload{
		TicketID:       t.ID,
		QueueNumber:    t.QueueNumber,
		ServiceName:    resolveServiceName(t),
		UnitID:         t.UnitID,
		ThresholdPct:   threshold,
		ElapsedSec:     elapsedSec,
		MaxWaitTimeSec: maxSec,
		AlertType:      alertTypeService,
	}

	eventName := eventServiceSlaWarning
	if threshold >= slaThreshold100 {
		eventName = eventServiceSlaBreach
	}
	s.hub.BroadcastEvent(eventName, payload, t.UnitID)
}

// shouldEmit checks (and updates) the per-ticket state to decide whether to emit
// an event for the given threshold. Returns true if the threshold is newly crossed.
func (s *SlaMonitorService) shouldEmit(stateKey string, threshold int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	st, ok := s.state[stateKey]
	if !ok {
		st = &slaTicketState{}
		s.state[stateKey] = st
	}
	if st.lastThreshold >= threshold {
		return false
	}
	st.lastThreshold = threshold
	return true
}

// currentThreshold maps a percentage to the highest crossed threshold constant
// (50, 80, 100). Returns 0 if below 50%.
func (s *SlaMonitorService) currentThreshold(pct int) int {
	switch {
	case pct >= slaThreshold100:
		return slaThreshold100
	case pct >= slaThreshold80:
		return slaThreshold80
	case pct >= slaThreshold50:
		return slaThreshold50
	default:
		return 0
	}
}

// resolveServiceName picks the best display name from the preloaded Service.
func resolveServiceName(t *models.Ticket) string {
	if t.Service.NameRu != nil && strings.TrimSpace(*t.Service.NameRu) != "" {
		return *t.Service.NameRu
	}
	return t.Service.Name
}
