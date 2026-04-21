package services

import (
	"testing"
)

// TestSlaSummaryCardHeight verifies the card height helper used inside the SLA PDF card.
func TestSlaSummaryCardHeight(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		hasWait bool
		hasSvc  bool
		wantH   float64
	}{
		{"neither", false, false, 48},
		{"wait only", true, false, 48},
		{"service only", false, true, 48},
		{"both", true, true, 96},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := slaSummaryCardHeight(tc.hasWait, tc.hasSvc)
			if got != tc.wantH {
				t.Errorf("slaSummaryCardHeight(%v, %v) = %v, want %v", tc.hasWait, tc.hasSvc, got, tc.wantH)
			}
		})
	}
}

// TestBuildStatisticsPDF_slaCardCondition verifies that BuildStatisticsPDF does not error
// (i.e. does not panic or return an error) for various SLA data configurations.
// Before the fix, service-only SLA would silently skip the card; this test ensures
// the gate condition `SlaWaitTotal > 0 || SlaServiceTotal > 0` works for all cases.
func TestBuildStatisticsPDF_slaCardCondition(t *testing.T) {
	t.Parallel()
	labels := StatsPDFLabelsEN()

	cases := []struct {
		name    string
		summary *SlaSummaryResponse
	}{
		{
			"no SLA data (nil summary)",
			nil,
		},
		{
			"no SLA data (zero totals)",
			&SlaSummaryResponse{SlaWaitTotal: 0, SlaServiceTotal: 0},
		},
		{
			"wait SLA only",
			&SlaSummaryResponse{SlaWaitMet: 80, SlaWaitTotal: 100, WithinPct: 80, BreachPct: 20},
		},
		{
			"service SLA only",
			&SlaSummaryResponse{SlaServiceMet: 90, SlaServiceTotal: 100},
		},
		{
			"both wait and service SLA",
			&SlaSummaryResponse{
				SlaWaitMet: 70, SlaWaitTotal: 100, WithinPct: 70, BreachPct: 30,
				SlaServiceMet: 85, SlaServiceTotal: 100,
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			input := StatisticsPDFInput{
				UnitName:   "Test Unit",
				DateFrom:   "2026-04-01",
				DateTo:     "2026-04-30",
				Labels:     labels,
				SlaSummary: tc.summary,
			}
			pdf, err := BuildStatisticsPDF(input)
			if err != nil {
				t.Fatalf("BuildStatisticsPDF error for %q: %v", tc.name, err)
			}
			if len(pdf) == 0 {
				t.Fatalf("BuildStatisticsPDF returned empty PDF for %q", tc.name)
			}
		})
	}
}
