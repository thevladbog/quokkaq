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
	// flushGen increments on each Schedule for a unit; stale timer callbacks exit without touching state.
	flushGen map[string]uint64
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
		flushGen: make(map[string]uint64),
	}
}

// SetAfterFlush runs after each successful unit.eta_update broadcast (e.g. staffing alerts).
func (b *ETABroadcaster) SetAfterFlush(f func(unitID string)) {
	if b == nil {
		return
	}
	b.mu.Lock()
	b.afterFlush = f
	b.mu.Unlock()
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
	b.flushGen[unitID]++
	gen := b.flushGen[unitID]
	b.pending[unitID] = time.AfterFunc(b.debounce, func() { b.flush(unitID, gen) })
	b.mu.Unlock()
}

func (b *ETABroadcaster) flush(unitID string, gen uint64) {
	b.mu.Lock()
	if b.flushGen[unitID] != gen {
		b.mu.Unlock()
		return
	}
	delete(b.pending, unitID)
	after := b.afterFlush
	b.mu.Unlock()

	if b.eta == nil || b.hub == nil {
		return
	}
	snap, err := b.eta.ComputeUnitETASnapshot(unitID)
	if err != nil {
		return
	}
	b.hub.BroadcastEvent("unit.eta_update", snap, unitID)
	if after != nil {
		after(unitID)
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
