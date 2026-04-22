package services

import (
	"strings"
	"sync"
	"time"

	"quokkaq-go-backend/internal/ws"
)

// ETAScheduler receives unit IDs when queue state changes so a debounced ETA snapshot can be broadcast.
type ETAScheduler interface {
	Schedule(unitID string)
}

const defaultETADebounce = 180 * time.Millisecond

// ETABroadcaster debounces ComputeUnitETASnapshot + WebSocket push to avoid storms during EOD/mass updates.
type ETABroadcaster struct {
	mu         sync.Mutex
	eta        *ETAService
	hub        *ws.Hub
	pending    map[string]*time.Timer
	debounce   time.Duration
	afterFlush func(unitID string)
}

// NewETABroadcaster creates a debounced ETA broadcaster. hub or eta may be nil (no-op).
func NewETABroadcaster(eta *ETAService, hub *ws.Hub, debounce time.Duration) *ETABroadcaster {
	if debounce <= 0 {
		debounce = defaultETADebounce
	}
	return &ETABroadcaster{
		eta:      eta,
		hub:      hub,
		pending:  make(map[string]*time.Timer),
		debounce: debounce,
	}
}

// SetAfterFlush runs after each successful unit.eta_update broadcast (e.g. staffing alerts).
func (b *ETABroadcaster) SetAfterFlush(f func(unitID string)) {
	if b == nil {
		return
	}
	b.afterFlush = f
}

// Schedule enqueues a debounced ETA snapshot broadcast for the unit.
func (b *ETABroadcaster) Schedule(unitID string) {
	if b == nil || b.eta == nil || b.hub == nil {
		return
	}
	unitID = strings.TrimSpace(unitID)
	if unitID == "" {
		return
	}
	b.mu.Lock()
	if t, ok := b.pending[unitID]; ok {
		t.Stop()
	}
	b.pending[unitID] = time.AfterFunc(b.debounce, func() { b.flush(unitID) })
	b.mu.Unlock()
}

func (b *ETABroadcaster) flush(unitID string) {
	b.mu.Lock()
	delete(b.pending, unitID)
	b.mu.Unlock()
	if b.eta == nil || b.hub == nil {
		return
	}
	snap, err := b.eta.ComputeUnitETASnapshot(unitID)
	if err != nil {
		return
	}
	b.hub.BroadcastEvent("unit.eta_update", snap, unitID)
	if b.afterFlush != nil {
		b.afterFlush(unitID)
	}
}

// WireTicketServiceETAScheduler attaches a debounced ETA broadcaster to the ticket service.
func WireTicketServiceETAScheduler(ts TicketService, sched ETAScheduler) {
	if ts == nil || sched == nil {
		return
	}
	if s, ok := ts.(*ticketService); ok {
		s.etaSched = sched
	}
}

// WireCounterServiceETAScheduler attaches a debounced ETA broadcaster to the counter service.
func WireCounterServiceETAScheduler(cs CounterService, sched ETAScheduler) {
	if cs == nil || sched == nil {
		return
	}
	if s, ok := cs.(*counterService); ok {
		s.etaSched = sched
	}
}
