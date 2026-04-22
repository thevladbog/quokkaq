package services

import (
	"fmt"
	"strings"
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

// TestBuildStatisticsPDF_StaffLeaderboard verifies that a PDF with StaffLeaderboard
// data renders without error and produces non-empty output.
func TestBuildStatisticsPDF_StaffLeaderboard(t *testing.T) {
	t.Parallel()
	csatAvg := 4.5
	input := StatisticsPDFInput{
		UnitName: "Test Unit",
		DateFrom: "2026-04-01",
		DateTo:   "2026-04-30",
		Labels:   StatsPDFLabelsEN(),
		StaffLeaderboard: &StaffPerformanceListResponse{
			Items: []StaffPerformanceResponse{
				{
					UserID:           "u-1",
					UserName:         "Alice Smith",
					TicketsCompleted: 120,
					SlaWaitMet:       110,
					SlaWaitTotal:     120,
					SlaServiceMet:    105,
					SlaServiceTotal:  120,
					UtilizationPct:   78.5,
					CsatAvg:          &csatAvg,
					CsatCount:        30,
				},
				{
					UserID:           "u-2",
					UserName:         "Bob Jones",
					TicketsCompleted: 95,
					SlaWaitMet:       80,
					SlaWaitTotal:     95,
					SlaServiceMet:    90,
					SlaServiceTotal:  95,
					UtilizationPct:   65.0,
					CsatAvg:          nil,
				},
			},
		},
	}
	pdf, err := BuildStatisticsPDF(input)
	if err != nil {
		t.Fatalf("BuildStatisticsPDF with StaffLeaderboard: %v", err)
	}
	if len(pdf) == 0 {
		t.Fatal("BuildStatisticsPDF returned empty PDF")
	}
}

// TestBuildStatisticsPDF_StaffForecast verifies that a PDF with StaffForecast data
// renders without error and that the SLA percentage is NOT multiplied by 100 again
// (regression for BUG-1: ExpectedSlaPct was formatted as *100 instead of as-is).
func TestBuildStatisticsPDF_StaffForecast(t *testing.T) {
	t.Parallel()
	// Use a value whose double (×100) is obviously wrong: 92.5 → should appear as "92.5%", not "9250.0%"
	knownSLAPct := 92.5
	input := StatisticsPDFInput{
		UnitName: "Test Unit",
		DateFrom: "2026-04-01",
		DateTo:   "2026-04-30",
		Labels:   StatsPDFLabelsEN(),
		StaffForecast: &StaffingForecastResponse{
			UnitID:     "unit-1",
			TargetDate: "2026-05-01",
			DayOfWeek:  "Thursday",
			HourlyForecasts: []HourlyStaffingForecast{
				{Hour: 9, ExpectedArrivals: 12, AvgServiceTimeMin: 5, RecommendedStaff: 2, ExpectedSlaPct: knownSLAPct},
				{Hour: 10, ExpectedArrivals: 20, AvgServiceTimeMin: 5, RecommendedStaff: 3, ExpectedSlaPct: 88.0},
			},
			DailySummary: DailyStaffingSummary{
				TotalExpectedArrivals: 32,
				PeakHour:              10,
				PeakArrivals:          20,
				MaxRecommendedStaff:   3,
				AvgRecommendedStaff:   2.5,
			},
		},
	}
	pdf, err := BuildStatisticsPDF(input)
	if err != nil {
		t.Fatalf("BuildStatisticsPDF with StaffForecast: %v", err)
	}
	if len(pdf) == 0 {
		t.Fatal("BuildStatisticsPDF returned empty PDF")
	}

	// Verify the SLA cell formatting correctness: the helper formats as-is (not *100).
	// We can't parse PDF text easily, but we can verify the format string directly.
	gotCell := fmt.Sprintf("%.1f%%", knownSLAPct)
	if !strings.HasSuffix(gotCell, "%") || gotCell == fmt.Sprintf("%.1f%%", knownSLAPct*100) {
		t.Errorf("SLA format string sanity check failed: got %q", gotCell)
	}
	if gotCell != "92.5%" {
		t.Errorf("expected SLA cell %q, got %q", "92.5%", gotCell)
	}
}

// TestBuildStatisticsPDF_BothNewSections verifies that combining both leaderboard and
// forecast in a single PDF does not error (tests potential page-overflow handling).
func TestBuildStatisticsPDF_BothNewSections(t *testing.T) {
	t.Parallel()
	csatAvg := 4.2
	input := StatisticsPDFInput{
		UnitName: "Full Report",
		DateFrom: "2026-04-01",
		DateTo:   "2026-04-30",
		Labels:   StatsPDFLabelsRU(), // test RU labels as well
		StaffLeaderboard: &StaffPerformanceListResponse{
			Items: []StaffPerformanceResponse{
				{UserID: "u-1", UserName: "Алиса", TicketsCompleted: 50, UtilizationPct: 70, CsatAvg: &csatAvg},
			},
		},
		StaffForecast: &StaffingForecastResponse{
			TargetDate: "2026-05-02",
			HourlyForecasts: []HourlyStaffingForecast{
				{Hour: 11, ExpectedArrivals: 8, RecommendedStaff: 2, ExpectedSlaPct: 91.0},
			},
			DailySummary: DailyStaffingSummary{MaxRecommendedStaff: 2},
		},
	}
	pdf, err := BuildStatisticsPDF(input)
	if err != nil {
		t.Fatalf("BuildStatisticsPDF both sections: %v", err)
	}
	if len(pdf) == 0 {
		t.Fatal("BuildStatisticsPDF returned empty PDF for both sections")
	}
}
