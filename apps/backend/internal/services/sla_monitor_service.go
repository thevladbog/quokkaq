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

	// WS event names.
	eventSlaWarning = "unit.sla_warning"
	eventSlaBreach  = "unit.sla_breach"

	defaultSlaMonitorIntervalSec = 10
)

// SlaAlertPayload is the data envelope sent with unit.sla_warning and unit.sla_breach WS events.
type SlaAlertPayload struct {
	TicketID       string `json:"ticketId"`
	QueueNumber    string `json:"queueNumber"`
	ServiceName    string `json:"serviceName"`
	UnitID         string `json:"unitId"`
	ThresholdPct   int    `json:"thresholdPct"` // 50, 80, or 100
	ElapsedSec     int    `json:"elapsedSec"`
	MaxWaitTimeSec int    `json:"maxWaitTimeSec"`
}

// slaTicketState tracks which threshold was last emitted for a ticket so we
// only fire each crossing once.
type slaTicketState struct {
	lastThreshold int // 0 = nothing emitted yet
}

// SlaMonitorService checks waiting tickets against their SLA thresholds on a
// regular tick and broadcasts WS events when a threshold is first crossed.
type SlaMonitorService struct {
	ticketRepo repository.TicketRepository
	hub        *ws.Hub

	mu    sync.Mutex
	state map[string]*slaTicketState // keyed by ticket ID
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

// tick is the core per-interval logic. It fetches waiting SLA tickets for every
// active WS room and emits events for newly crossed thresholds.
func (s *SlaMonitorService) tick() {
	rooms := s.hub.ActiveRooms()
	if len(rooms) == 0 {
		return
	}

	now := time.Now()
	seenTicketIDs := make(map[string]struct{}, 64)

	for _, unitID := range rooms {
		tickets, err := s.ticketRepo.GetWaitingTicketsWithSLA(unitID)
		if err != nil {
			slog.Error("sla monitor: GetWaitingTicketsWithSLA", "unit_id", unitID, "err", err)
			continue
		}

		for i := range tickets {
			t := &tickets[i]
			seenTicketIDs[t.ID] = struct{}{}
			s.evaluateTicket(t, now)
		}
	}

	// Evict state for tickets no longer waiting (completed, called, etc.)
	s.mu.Lock()
	for id := range s.state {
		if _, active := seenTicketIDs[id]; !active {
			delete(s.state, id)
		}
	}
	s.mu.Unlock()
}

// evaluateTicket computes the SLA percent for a single ticket and fires a WS
// event if a new threshold has been crossed since the last tick.
func (s *SlaMonitorService) evaluateTicket(t *models.Ticket, now time.Time) {
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

	s.mu.Lock()
	st, ok := s.state[t.ID]
	if !ok {
		st = &slaTicketState{}
		s.state[t.ID] = st
	}
	if st.lastThreshold >= threshold {
		s.mu.Unlock()
		return
	}
	st.lastThreshold = threshold
	s.mu.Unlock()

	payload := SlaAlertPayload{
		TicketID:       t.ID,
		QueueNumber:    t.QueueNumber,
		ServiceName:    serviceName(t),
		UnitID:         t.UnitID,
		ThresholdPct:   threshold,
		ElapsedSec:     elapsedSec,
		MaxWaitTimeSec: maxSec,
	}

	eventName := eventSlaWarning
	if threshold >= slaThreshold100 {
		eventName = eventSlaBreach
	}

	s.hub.BroadcastEvent(eventName, payload, t.UnitID)
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

// serviceName resolves the best display name from the preloaded Service.
func serviceName(t *models.Ticket) string {
	if t.Service.NameRu != nil && strings.TrimSpace(*t.Service.NameRu) != "" {
		return *t.Service.NameRu
	}
	return t.Service.Name
}
