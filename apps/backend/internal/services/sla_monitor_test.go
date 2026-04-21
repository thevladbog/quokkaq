package services

import (
	"testing"
)

func newTestSlaMonitor() *SlaMonitorService {
	return &SlaMonitorService{
		state: make(map[string]*slaTicketState),
	}
}

func TestCurrentThreshold(t *testing.T) {
	t.Parallel()
	svc := newTestSlaMonitor()

	cases := []struct {
		pct  int
		want int
	}{
		{0, 0},
		{49, 0},
		{50, 50},
		{51, 50},
		{79, 50},
		{80, 80},
		{81, 80},
		{99, 80},
		{100, 100},
		{101, 100},
		{150, 100},
	}

	for _, tc := range cases {
		got := svc.currentThreshold(tc.pct)
		if got != tc.want {
			t.Errorf("currentThreshold(%d) = %d, want %d", tc.pct, got, tc.want)
		}
	}
}

func TestShouldEmit_dedup(t *testing.T) {
	t.Parallel()
	svc := newTestSlaMonitor()
	key := "w:ticket-1"

	// First call at 50% → new crossing, must emit.
	if !svc.shouldEmit(key, 50) {
		t.Fatal("expected true for first 50% crossing")
	}

	// Second call at 50% → already emitted, must not repeat.
	if svc.shouldEmit(key, 50) {
		t.Fatal("expected false for duplicate 50% crossing")
	}

	// 80% → new crossing.
	if !svc.shouldEmit(key, 80) {
		t.Fatal("expected true for first 80% crossing")
	}

	// Back to 50% → lastThreshold is 80, must not downgrade.
	if svc.shouldEmit(key, 50) {
		t.Fatal("expected false: should not re-emit lower threshold after 80%")
	}

	// 100% → new crossing.
	if !svc.shouldEmit(key, 100) {
		t.Fatal("expected true for first 100% crossing")
	}

	// 100% again → already at max.
	if svc.shouldEmit(key, 100) {
		t.Fatal("expected false for duplicate 100% crossing")
	}
}

func TestShouldEmit_separateKeys(t *testing.T) {
	t.Parallel()
	svc := newTestSlaMonitor()

	// Emit 50% on the wait key.
	if !svc.shouldEmit("w:t1", 50) {
		t.Fatal("expected true for wait key")
	}

	// Service key is independent; should still emit 50%.
	if !svc.shouldEmit("s:t1", 50) {
		t.Fatal("expected true for service key (independent from wait key)")
	}

	// Emit 80% on service key.
	if !svc.shouldEmit("s:t1", 80) {
		t.Fatal("expected true for service key 80%")
	}

	// Wait key is still only at 50%; 80% should be a new crossing there.
	if !svc.shouldEmit("w:t1", 80) {
		t.Fatal("expected true for wait key 80% (state is independent)")
	}
}

func TestShouldEmit_unknownKey_createsState(t *testing.T) {
	t.Parallel()
	svc := newTestSlaMonitor()

	// A key not yet in state must be treated as "nothing emitted".
	if !svc.shouldEmit("w:brand-new", 50) {
		t.Fatal("expected true for a brand-new state key")
	}

	// State entry is now created; duplicate must return false.
	if svc.shouldEmit("w:brand-new", 50) {
		t.Fatal("expected false for duplicate call after state is created")
	}
}
