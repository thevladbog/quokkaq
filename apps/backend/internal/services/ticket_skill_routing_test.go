package services

// Tests for the findNextTicketTx skill-based routing logic.
// Uses stub implementations of TicketRepository, UnitRepository, and OperatorSkillRepository
// so no database is required.

import (
	"errors"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"

	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Stub implementations
// ─────────────────────────────────────────────────────────────────────────────

// stubTicketRepo implements only the methods called by findNextTicketTx.
type stubTicketRepo struct {
	repository.TicketRepository // embed interface for unimplemented methods

	// waitingTickets is the pool used by FindWaiting* — keyed by service_id.
	waitingByService map[string]*models.Ticket
	// waitingFifo is the fallback FIFO ticket.
	waitingFifo *models.Ticket
}

func (r *stubTicketRepo) Transaction(fn func(tx *gorm.DB) error) error {
	return fn(nil)
}

func (r *stubTicketRepo) FindWaitingForUpdateTx(_ *gorm.DB, _ string, _ []string, _ *string) (*models.Ticket, error) {
	if r.waitingFifo == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return r.waitingFifo, nil
}

func (r *stubTicketRepo) FindWaitingWithSkillsTx(_ *gorm.DB, _ string, skillServiceIDs []string, _ *string) (*models.Ticket, error) {
	for _, sid := range skillServiceIDs {
		if t, ok := r.waitingByService[sid]; ok {
			return t, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

// stubUnitRepo returns a Unit with configurable SkillBasedRoutingEnabled.
type stubUnitRepo struct {
	repository.UnitRepository // embed interface for unimplemented methods
	skillEnabled              bool
}

func (r *stubUnitRepo) FindByIDLight(_ string) (*models.Unit, error) {
	return &models.Unit{
		ID:                       "unit-1",
		SkillBasedRoutingEnabled: r.skillEnabled,
	}, nil
}

// stubOperatorSkillRepo returns a fixed list of service IDs.
type stubOperatorSkillRepo struct {
	repository.OperatorSkillRepository          // embed interface for unimplemented methods
	serviceIDs                         []string // returned for any operator
}

func (r *stubOperatorSkillRepo) ListSkillServiceIDsForOperator(_, _ string) ([]string, error) {
	return r.serviceIDs, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a ticketService with stubs
// ─────────────────────────────────────────────────────────────────────────────

func newStubTicketService(
	skillEnabled bool,
	skillServiceIDs []string,
	waitingByService map[string]*models.Ticket,
	fifoTicket *models.Ticket,
) *ticketService {
	hub := ws.NewHub()
	go hub.Run()

	return &ticketService{
		repo:              &stubTicketRepo{waitingByService: waitingByService, waitingFifo: fifoTicket},
		unitRepo:          &stubUnitRepo{skillEnabled: skillEnabled},
		operatorSkillRepo: &stubOperatorSkillRepo{serviceIDs: skillServiceIDs},
		hub:               hub,
	}
}

func makeTicket(id, serviceID string) *models.Ticket {
	return &models.Ticket{
		ID:        id,
		ServiceID: serviceID,
		UnitID:    "unit-1",
		Status:    "waiting",
		CreatedAt: time.Now(),
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

// TestFindNextTicketTx_SkillMatch verifies that the skill-matched ticket is returned
// when skill routing is enabled and a matching ticket exists in the queue.
func TestFindNextTicketTx_SkillMatch(t *testing.T) {
	t.Parallel()
	userID := "op-1"
	svcA := "svc-A"
	svcB := "svc-B"

	ticketA := makeTicket("t-A", svcA)
	ticketB := makeTicket("t-B", svcB) // should NOT be returned

	svc := newStubTicketService(
		true,           // skillBasedRoutingEnabled
		[]string{svcA}, // operator is skilled in svcA
		map[string]*models.Ticket{svcA: ticketA, svcB: ticketB},
		ticketB, // FIFO fallback would return B
	)

	counter := &models.Counter{ID: "c-1", UnitID: "unit-1", AssignedTo: &userID}
	ticket, missed, missUser, missIDs, err := svc.findNextTicketTx(nil, "unit-1", nil, counter)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ticket.ID != ticketA.ID {
		t.Errorf("got ticket %q, want skill-matched %q", ticket.ID, ticketA.ID)
	}
	if missed {
		t.Error("missed=true but skill match succeeded")
	}
	if missUser != "" || len(missIDs) != 0 {
		t.Errorf("miss data should be empty on success: user=%q, ids=%v", missUser, missIDs)
	}
}

// TestFindNextTicketTx_SkillFallback verifies that when no skill-matched ticket exists
// the method falls back to FIFO and sets the miss flag.
func TestFindNextTicketTx_SkillFallback(t *testing.T) {
	t.Parallel()
	userID := "op-2"
	svcA := "svc-A"
	svcC := "svc-C" // operator is skilled in C, but only A ticket is waiting

	ticketA := makeTicket("t-A", svcA)

	svc := newStubTicketService(
		true,                        // skillBasedRoutingEnabled
		[]string{svcC},              // operator's skill doesn't match waiting tickets
		map[string]*models.Ticket{}, // no skill-match
		ticketA,                     // FIFO fallback returns A
	)

	counter := &models.Counter{ID: "c-2", UnitID: "unit-1", AssignedTo: &userID}
	ticket, missed, missUser, missIDs, err := svc.findNextTicketTx(nil, "unit-1", nil, counter)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ticket.ID != ticketA.ID {
		t.Errorf("FIFO fallback: got %q, want %q", ticket.ID, ticketA.ID)
	}
	if !missed {
		t.Error("missed=false but skill routing should have reported a miss")
	}
	if missUser != userID {
		t.Errorf("missUser=%q, want %q", missUser, userID)
	}
	if len(missIDs) == 0 || missIDs[0] != svcC {
		t.Errorf("missIDs=%v, want [%q]", missIDs, svcC)
	}
}

// TestFindNextTicketTx_SkillDisabled verifies that when the feature is off the service
// uses pure FIFO with no miss flag regardless of operator skills.
func TestFindNextTicketTx_SkillDisabled(t *testing.T) {
	t.Parallel()
	userID := "op-3"
	svcA := "svc-A"

	ticketA := makeTicket("t-A", svcA)

	svc := newStubTicketService(
		false,          // skillBasedRoutingEnabled = OFF
		[]string{svcA}, // operator has skills (but feature is off)
		map[string]*models.Ticket{svcA: ticketA},
		ticketA,
	)

	counter := &models.Counter{ID: "c-3", UnitID: "unit-1", AssignedTo: &userID}
	ticket, missed, missUser, missIDs, err := svc.findNextTicketTx(nil, "unit-1", nil, counter)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ticket.ID != ticketA.ID {
		t.Errorf("got %q, want %q", ticket.ID, ticketA.ID)
	}
	if missed || missUser != "" || len(missIDs) != 0 {
		t.Error("no miss data expected when skill routing is disabled")
	}
}

// TestFindNextTicketTx_NoAssignedOperator verifies that a counter with no assigned operator
// falls straight to FIFO.
func TestFindNextTicketTx_NoAssignedOperator(t *testing.T) {
	t.Parallel()
	ticketA := makeTicket("t-A", "svc-A")

	svc := newStubTicketService(
		true,
		[]string{"svc-A"},
		map[string]*models.Ticket{"svc-A": ticketA},
		ticketA,
	)

	// AssignedTo is nil
	counter := &models.Counter{ID: "c-4", UnitID: "unit-1", AssignedTo: nil}
	ticket, missed, _, _, err := svc.findNextTicketTx(nil, "unit-1", nil, counter)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ticket.ID != ticketA.ID {
		t.Errorf("got %q, want %q", ticket.ID, ticketA.ID)
	}
	if missed {
		t.Error("missed should be false when no operator assigned")
	}
}

// TestFindNextTicketTx_EmptyQueue verifies that ErrNoWaitingTickets is returned
// when both skill lookup and FIFO find nothing.
func TestFindNextTicketTx_EmptyQueue(t *testing.T) {
	t.Parallel()
	userID := "op-5"

	svc := newStubTicketService(
		true,
		[]string{"svc-A"},
		map[string]*models.Ticket{},
		nil, // no FIFO ticket either
	)

	counter := &models.Counter{ID: "c-5", UnitID: "unit-1", AssignedTo: &userID}
	_, _, _, _, err := svc.findNextTicketTx(nil, "unit-1", nil, counter)
	if !errors.Is(err, ErrNoWaitingTickets) {
		t.Errorf("expected ErrNoWaitingTickets, got %v", err)
	}
}

// TestFilterSkillIDsByServiceFilter covers the intersection helper.
func TestFilterSkillIDsByServiceFilter(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		skills []string
		filter []string
		want   []string
	}{
		{"empty filter returns all skills", []string{"A", "B", "C"}, nil, []string{"A", "B", "C"}},
		{"filter restricts to intersection", []string{"A", "B", "C"}, []string{"B", "C", "D"}, []string{"B", "C"}},
		{"no intersection returns empty", []string{"A", "B"}, []string{"C", "D"}, []string{}},
		{"empty skills", []string{}, []string{"A"}, []string{}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := filterSkillIDsByServiceFilter(tc.skills, tc.filter)
			if len(got) != len(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			for i, g := range got {
				if g != tc.want[i] {
					t.Errorf("[%d]: got %q, want %q", i, g, tc.want[i])
				}
			}
		})
	}
}
