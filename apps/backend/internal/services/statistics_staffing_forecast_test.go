package services

import (
	"math"
	"testing"
)

// ---------------------------------------------------------------------------
// erlangC tests
// ---------------------------------------------------------------------------

// TestErlangC_ZeroLoad verifies that zero offered load returns probability 0.
func TestErlangC_ZeroLoad(t *testing.T) {
	t.Parallel()
	got := erlangC(2, 0)
	if got != 0 {
		t.Errorf("erlangC(2, 0) = %v, want 0", got)
	}
}

// TestErlangC_SingleServer_ModerateLoad tests n=1, a=0.5.
// For M/M/1: C(1,a) = a (Erlang C reduces to Erlang B denominator term in this case).
// Actually for M/M/1: C(1,a) = a / (1 - a + a) = a / 1 = wait probability; let's verify numerically.
func TestErlangC_SingleServer(t *testing.T) {
	t.Parallel()
	// n=1, a=0.5: P(wait>0) = a/(1-a+a) — but standard Erlang C formula gives:
	// numerator = a^1 / 1! * 1/(1-0.5) = 0.5 * 2 = 1
	// sum_{k=0}^{0} a^k/k! = 1
	// denom = 1 + 1 = 2 → C = 1/2 = 0.5
	got := erlangC(1, 0.5)
	want := 0.5
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("erlangC(1, 0.5) = %v, want %v", got, want)
	}
}

// TestErlangC_Saturated verifies that when rho >= 1 the function returns 1.
func TestErlangC_Saturated(t *testing.T) {
	t.Parallel()
	// n=2, a=3 → rho = 3/2 = 1.5 ≥ 1 → saturated
	got := erlangC(2, 3.0)
	if got != 1.0 {
		t.Errorf("erlangC(2, 3) = %v, want 1.0 (saturated)", got)
	}
}

// TestErlangC_HighAgents verifies that adding many agents drives P(wait>0) close to 0.
func TestErlangC_HighAgents(t *testing.T) {
	t.Parallel()
	// n=20, a=1 → rho = 0.05; queue is almost never used
	got := erlangC(20, 1.0)
	if got > 0.01 {
		t.Errorf("erlangC(20, 1) = %v, want < 0.01 (very low congestion)", got)
	}
}

// TestErlangC_KnownValue tests a classic textbook case.
// n=2, a=1.0: C(2,1) = a^2/2! * 2/(2-1) / [1 + a + a^2/2! * 2/(2-1)]
//
//	= 0.5*2 / [1 + 1 + 0.5*2] = 1 / [1+1+1] = 1/3 ≈ 0.3333
func TestErlangC_KnownValue(t *testing.T) {
	t.Parallel()
	got := erlangC(2, 1.0)
	want := 1.0 / 3.0
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("erlangC(2, 1) = %v, want %v", got, want)
	}
}

// ---------------------------------------------------------------------------
// erlangCSLA tests
// ---------------------------------------------------------------------------

// TestErlangCSLA_ZeroArrivals verifies that zero lambda returns 0.
func TestErlangCSLA_ZeroArrivals(t *testing.T) {
	t.Parallel()
	got := erlangCSLA(0, 0.5, 2, 5.0)
	if got != 0 {
		t.Errorf("erlangCSLA(0, 0.5, 2, 5) = %v, want 0", got)
	}
}

// TestErlangCSLA_ZeroMu verifies that zero mu returns 0.
func TestErlangCSLA_ZeroMu(t *testing.T) {
	t.Parallel()
	got := erlangCSLA(1, 0, 2, 5.0)
	if got != 0 {
		t.Errorf("erlangCSLA(1, 0, 2, 5) = %v, want 0", got)
	}
}

// TestErlangCSLA_Unstable verifies that an unstable queue (rho ≥ 1) returns 0.
func TestErlangCSLA_Unstable(t *testing.T) {
	t.Parallel()
	// lambda=10, mu=3, n=1 → rho = 10/3 > 1 → unstable
	got := erlangCSLA(10, 3, 1, 5.0)
	if got != 0 {
		t.Errorf("erlangCSLA(10, 3, 1, 5) = %v, want 0 (unstable)", got)
	}
}

// TestErlangCSLA_InRange verifies that the SLA value is within [0,1].
func TestErlangCSLA_InRange(t *testing.T) {
	t.Parallel()
	cases := []struct {
		lambda, mu float64
		n          int
		t          float64
	}{
		{5, 0.2, 30, 5},
		{1, 0.1, 15, 3},
		{0.5, 0.2, 4, 5},
		{2, 1, 3, 2},
	}
	for _, tc := range cases {
		got := erlangCSLA(tc.lambda, tc.mu, tc.n, tc.t)
		if got < 0 || got > 1.0 {
			t.Errorf("erlangCSLA(%v, %v, %v, %v) = %v: not in [0,1]", tc.lambda, tc.mu, tc.n, tc.t, got)
		}
	}
}

// TestErlangCSLA_MoreAgentsBetter verifies that adding an agent never decreases SLA.
func TestErlangCSLA_MoreAgentsBetter(t *testing.T) {
	t.Parallel()
	lambda, mu := 2.0, 0.5
	target := 5.0
	prev := erlangCSLA(lambda, mu, 4, target) // minimum feasible n = ceil(4)+1 = 5
	for n := 5; n <= 12; n++ {
		curr := erlangCSLA(lambda, mu, n, target)
		if curr < prev-1e-12 {
			t.Errorf("SLA decreased from n=%d to n=%d: %v → %v", n-1, n, prev, curr)
		}
		prev = curr
	}
}

// TestErlangCSLA_ZeroWaitTarget verifies behavior at t=0.
// P(wait <= 0) should equal 1 - C(n,a) (probability of finding idle agent on arrival).
func TestErlangCSLA_ZeroWaitTarget(t *testing.T) {
	t.Parallel()
	lambda, mu := 1.0, 1.0
	n := 3
	c := erlangC(n, lambda/mu)
	gotSLA := erlangCSLA(lambda, mu, n, 0)
	// P(wait <= 0) = 1 - C(n,a)*exp(0) = 1 - C(n,a)
	want := 1 - c
	if math.Abs(gotSLA-want) > 1e-9 {
		t.Errorf("erlangCSLA at t=0: got %v, want %v", gotSLA, want)
	}
}

// ---------------------------------------------------------------------------
// erlangCMinAgents tests
// ---------------------------------------------------------------------------

// TestErlangCMinAgents_ZeroLoad verifies that zero load returns 1.
func TestErlangCMinAgents_ZeroLoad(t *testing.T) {
	t.Parallel()
	got := erlangCMinAgents(0, 0.5, 0.9, 5)
	if got != 1 {
		t.Errorf("erlangCMinAgents(0, ...) = %v, want 1", got)
	}
}

// TestErlangCMinAgents_SatisfiesTarget verifies the returned n achieves the SLA target.
func TestErlangCMinAgents_SatisfiesTarget(t *testing.T) {
	t.Parallel()
	cases := []struct {
		lambda, mu, targetSLA, targetWait float64
	}{
		{2.0, 0.5, 0.9, 5},
		{5.0, 0.2, 0.9, 5},
		{1.0, 0.5, 0.8, 3},
		{10.0, 1.0, 0.95, 2},
	}
	for _, tc := range cases {
		n := erlangCMinAgents(tc.lambda, tc.mu, tc.targetSLA, tc.targetWait)
		sla := erlangCSLA(tc.lambda, tc.mu, n, tc.targetWait)
		if sla < tc.targetSLA-1e-9 && n < 200 {
			t.Errorf("erlangCMinAgents(%v,%v,%v,%v)=%d but SLA=%v < target=%v",
				tc.lambda, tc.mu, tc.targetSLA, tc.targetWait, n, sla, tc.targetSLA)
		}
	}
}

// TestErlangCMinAgents_MonotonicLoad verifies that required agents increase with load.
func TestErlangCMinAgents_MonotonicLoad(t *testing.T) {
	t.Parallel()
	mu := 0.2
	sla := 0.9
	wait := 5.0
	prev := erlangCMinAgents(1, mu, sla, wait)
	for lambdaInt := 2; lambdaInt <= 20; lambdaInt++ {
		lambda := float64(lambdaInt)
		curr := erlangCMinAgents(lambda, mu, sla, wait)
		if curr < prev {
			t.Errorf("agents decreased from lambda=%v(%d) to lambda=%v(%d)", float64(lambdaInt-1), prev, lambda, curr)
		}
		prev = curr
	}
}

// ---------------------------------------------------------------------------
// logFactorial tests
// ---------------------------------------------------------------------------

// TestLogFactorial verifies exact values for small n.
func TestLogFactorial(t *testing.T) {
	t.Parallel()
	cases := []struct {
		n    int
		want float64
	}{
		{0, 0},
		{1, 0},
		{2, math.Log(2)},
		{3, math.Log(6)},
		{5, math.Log(120)},
		{10, math.Log(3628800)},
	}
	for _, tc := range cases {
		got := logFactorial(tc.n)
		if math.Abs(got-tc.want) > 1e-9 {
			t.Errorf("logFactorial(%d) = %v, want %v", tc.n, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// buildDailySummary tests
// ---------------------------------------------------------------------------

func TestBuildDailySummary_Empty(t *testing.T) {
	t.Parallel()
	s := buildDailySummary(nil)
	if s.TotalExpectedArrivals != 0 || s.MaxRecommendedStaff != 0 {
		t.Errorf("buildDailySummary(nil) = %+v, want zero value", s)
	}
}

func TestBuildDailySummary_PeakHour(t *testing.T) {
	t.Parallel()
	forecasts := []HourlyStaffingForecast{
		{Hour: 8, ExpectedArrivals: 10, RecommendedStaff: 3},
		{Hour: 9, ExpectedArrivals: 25, RecommendedStaff: 7},
		{Hour: 10, ExpectedArrivals: 18, RecommendedStaff: 5},
	}
	s := buildDailySummary(forecasts)
	if s.PeakHour != 9 {
		t.Errorf("PeakHour = %d, want 9", s.PeakHour)
	}
	if math.Abs(s.PeakArrivals-25) > 1e-9 {
		t.Errorf("PeakArrivals = %v, want 25", s.PeakArrivals)
	}
	if s.MaxRecommendedStaff != 7 {
		t.Errorf("MaxRecommendedStaff = %d, want 7", s.MaxRecommendedStaff)
	}
	wantTotal := 10.0 + 25 + 18
	if math.Abs(s.TotalExpectedArrivals-wantTotal) > 1e-9 {
		t.Errorf("TotalExpectedArrivals = %v, want %v", s.TotalExpectedArrivals, wantTotal)
	}
	wantAvg := float64(3+7+5) / 3.0
	if math.Abs(s.AvgRecommendedStaff-wantAvg) > 1e-9 {
		t.Errorf("AvgRecommendedStaff = %v, want %v", s.AvgRecommendedStaff, wantAvg)
	}
}

// TestApplyForecastDefaults verifies that missing params get sensible defaults.
func TestApplyForecastDefaults(t *testing.T) {
	t.Parallel()
	p := applyForecastDefaults(StaffingForecastParams{})
	if p.TargetSLAPercent != 90 {
		t.Errorf("default TargetSLAPercent = %v, want 90", p.TargetSLAPercent)
	}
	if p.TargetMaxWaitMin != 5 {
		t.Errorf("default TargetMaxWaitMin = %v, want 5", p.TargetMaxWaitMin)
	}
	if p.LookbackWeeks != 4 {
		t.Errorf("default LookbackWeeks = %v, want 4", p.LookbackWeeks)
	}
	if p.TargetDate == "" {
		t.Errorf("default TargetDate should be set to tomorrow, got empty")
	}
}
