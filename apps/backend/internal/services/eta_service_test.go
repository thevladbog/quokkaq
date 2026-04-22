package services

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// --- minimal stubs (only implement methods called by ETAService) ---

// etaTicketRepo wraps the interface via embedding so only overridden methods compile.
type etaTicketRepo struct {
	repository.TicketRepository
	recentTimes         map[string][]int
	queuePosition       int
	queuePosErr         error
	waitingByUnit       int64
	waitingByUnitErr    error
	waitingByService    []repository.ServiceWaitingCount
	waitingByServiceErr error
}

func (s *etaTicketRepo) GetRecentCompletedServiceTimes(unitID, serviceID string, _ int) ([]int, error) {
	key := unitID + "|" + serviceID
	if v, ok := s.recentTimes[key]; ok {
		return v, nil
	}
	return nil, nil
}

func (s *etaTicketRepo) GetQueuePosition(_ *models.Ticket) (int, error) {
	return s.queuePosition, s.queuePosErr
}

func (s *etaTicketRepo) CountWaitingByUnit(_ string) (int64, error) {
	return s.waitingByUnit, s.waitingByUnitErr
}

func (s *etaTicketRepo) CountWaitingByService(_ string) ([]repository.ServiceWaitingCount, error) {
	return s.waitingByService, s.waitingByServiceErr
}

func (s *etaTicketRepo) GetWaitingTickets(_ string) ([]models.Ticket, error) {
	return nil, nil
}

func (s *etaTicketRepo) GetServiceTimeHourlyVsOverall(_ string, _ string, _ int, _ time.Weekday, _ int) (float64, float64, error) {
	return 0, 0, nil
}

func (s *etaTicketRepo) GetAvgServiceSecPerOccupiedCounter(_ string, _ int) (map[string]float64, error) {
	return nil, nil
}

func (s *etaTicketRepo) GetWaitingTicketsWithSLA(_ string) ([]models.Ticket, error) {
	return nil, nil
}

func (s *etaTicketRepo) CountTicketsCreatedSince(_ string, _ time.Time) (int64, error) {
	return 0, nil
}

// etaStatsRepoStub implements StatisticsRepository for ETA bucket fallback tests.
type etaStatsRepoStub struct {
	avgSec float64
	ok     bool
	err    error
}

func (e *etaStatsRepoStub) UpsertDailyBucket(*models.StatisticsDailyBucket) error { return nil }
func (e *etaStatsRepoStub) ListDailyBuckets(string, string, string, *string, repository.StatisticsZoneQuery) ([]models.StatisticsDailyBucket, error) {
	return nil, nil
}
func (e *etaStatsRepoStub) DeleteDailyBucketsForUnitDay(string, string) error { return nil }
func (e *etaStatsRepoStub) AvgServiceSecSubdivisionRollup(_ string, _ int) (float64, bool, error) {
	return e.avgSec, e.ok, e.err
}
func (e *etaStatsRepoStub) UpsertSurveyDaily(*models.StatisticsSurveyDaily) error { return nil }
func (e *etaStatsRepoStub) DeleteSurveyDailyForUnitDay(string, string) error      { return nil }
func (e *etaStatsRepoStub) ListSurveyDaily(string, string, string) ([]models.StatisticsSurveyDaily, error) {
	return nil, nil
}

// etaCounterRepo embeds the interface and only overrides CountActive.
type etaCounterRepo struct {
	repository.CounterRepository
	activeCount int64
	activeErr   error
}

func (s *etaCounterRepo) CountActive(_ string) (int64, error) {
	return s.activeCount, s.activeErr
}

// etaServiceRepo embeds the interface and only overrides FindMapByIDs.
type etaServiceRepo struct {
	repository.ServiceRepository
	serviceMap map[string]*models.Service
}

func (s *etaServiceRepo) FindMapByIDs(_ []string) (map[string]*models.Service, error) {
	if s.serviceMap != nil {
		return s.serviceMap, nil
	}
	return map[string]*models.Service{}, nil
}

// helper for creating a gorm.DB-satisfying counter repo (unused but avoids
// embedding issues when nil methods would be called)
var _ repository.CounterRepository = (*etaCounterRepo)(nil)

// --- QueuePositionAndETA ---

func TestQueuePositionAndETA_nonWaitingReturnsZeros(t *testing.T) {
	t.Parallel()
	svc := NewETAService(&etaTicketRepo{}, &etaCounterRepo{})
	result, err := svc.QueuePositionAndETA(&models.Ticket{Status: "called"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Position != 0 || result.EstimatedWaitSec != 0 {
		t.Fatalf("want zeros for non-waiting ticket, got %+v", result)
	}
}

func TestQueuePositionAndETA_returnsPositionAndETA(t *testing.T) {
	t.Parallel()
	unitID, svcID := "u1", "s1"
	// 5 samples × 60 s → avg 60 s; position 3, 1 counter → ETA = 3×60/1 = 180
	ticketRepo := &etaTicketRepo{
		recentTimes:   map[string][]int{unitID + "|" + svcID: {60, 60, 60, 60, 60}},
		queuePosition: 3,
	}
	svc := NewETAService(ticketRepo, &etaCounterRepo{activeCount: 1})
	result, err := svc.QueuePositionAndETA(&models.Ticket{Status: "waiting", UnitID: unitID, ServiceID: svcID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Position != 3 {
		t.Errorf("position: want 3, got %d", result.Position)
	}
	if result.EstimatedWaitSec != 180 {
		t.Errorf("ETA: want 180, got %d", result.EstimatedWaitSec)
	}
}

func TestQueuePositionAndETA_multipleCountersReduceETA(t *testing.T) {
	t.Parallel()
	unitID, svcID := "u1", "s1"
	ticketRepo := &etaTicketRepo{
		recentTimes:   map[string][]int{unitID + "|" + svcID: {60, 60, 60, 60, 60}},
		queuePosition: 4,
	}
	svc := NewETAService(ticketRepo, &etaCounterRepo{activeCount: 2})
	result, err := svc.QueuePositionAndETA(&models.Ticket{Status: "waiting", UnitID: unitID, ServiceID: svcID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 4 × 60 / 2 = 120
	if result.EstimatedWaitSec != 120 {
		t.Errorf("ETA with 2 counters: want 120, got %d", result.EstimatedWaitSec)
	}
}

func TestQueuePositionAndETA_fallsBackToMaxWaitingTime(t *testing.T) {
	t.Parallel()
	// Only 2 samples — below etaMinSamplesRequired (3) → avg returns 0 → fall back
	ticketRepo := &etaTicketRepo{
		recentTimes:   map[string][]int{"u1|s1": {60, 60}},
		queuePosition: 2,
	}
	svc := NewETAService(ticketRepo, &etaCounterRepo{activeCount: 1})
	maxWait := 300
	result, err := svc.QueuePositionAndETA(&models.Ticket{
		Status: "waiting", UnitID: "u1", ServiceID: "s1",
		MaxWaitingTime: &maxWait,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.EstimatedWaitSec != 300 {
		t.Errorf("fallback ETA: want 300, got %d", result.EstimatedWaitSec)
	}
}

func TestQueuePositionAndETA_positionErrorReturnsError(t *testing.T) {
	t.Parallel()
	ticketRepo := &etaTicketRepo{queuePosErr: errors.New("db error")}
	svc := NewETAService(ticketRepo, &etaCounterRepo{})
	_, err := svc.QueuePositionAndETA(&models.Ticket{Status: "waiting", UnitID: "u1", ServiceID: "s1"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// --- GetUnitQueueSummary ---

func TestGetUnitQueueSummary_aggregateStats(t *testing.T) {
	t.Parallel()
	unitID := "u1"
	ticketRepo := &etaTicketRepo{
		waitingByUnit: 5,
		recentTimes:   map[string][]int{unitID + "|": {60, 60, 60, 60, 60}},
	}
	svc := NewETAService(ticketRepo, &etaCounterRepo{activeCount: 2})
	summary, err := svc.GetUnitQueueSummary(unitID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.QueueLength != 5 {
		t.Errorf("queue length: want 5, got %d", summary.QueueLength)
	}
	if summary.ActiveCounters != 2 {
		t.Errorf("active counters: want 2, got %d", summary.ActiveCounters)
	}
	// ETA = 5×60/2/60 = 2.5 minutes
	if summary.EstimatedWaitMinutes < 2.4 || summary.EstimatedWaitMinutes > 2.6 {
		t.Errorf("estimated wait minutes: want ~2.5, got %f", summary.EstimatedWaitMinutes)
	}
	if len(summary.Services) != 0 {
		t.Errorf("services: want empty without serviceRepo, got %d", len(summary.Services))
	}
}

func TestGetUnitQueueSummary_perServiceBreakdown(t *testing.T) {
	t.Parallel()
	unitID := "u1"
	svc1, svc2 := "svc-a", "svc-b"
	ticketRepo := &etaTicketRepo{
		waitingByUnit: 3,
		recentTimes: map[string][]int{
			unitID + "|":        {60, 60, 60, 60, 60},
			unitID + "|" + svc1: {60, 60, 60, 60, 60},
			unitID + "|" + svc2: {90, 90, 90, 90, 90},
		},
		waitingByService: []repository.ServiceWaitingCount{
			{ServiceID: svc1, Count: 2},
			{ServiceID: svc2, Count: 1},
		},
	}
	serviceRepo := &etaServiceRepo{serviceMap: map[string]*models.Service{
		svc1: {ID: svc1, Name: "Service A"},
		svc2: {ID: svc2, Name: "Service B"},
	}}
	eta := NewETAServiceWithServiceRepo(ticketRepo, &etaCounterRepo{activeCount: 1}, serviceRepo)
	summary, err := eta.GetUnitQueueSummary(unitID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(summary.Services) != 2 {
		t.Fatalf("services: want 2, got %d", len(summary.Services))
	}
	foundA := false
	for _, s := range summary.Services {
		if s.ServiceID == svc1 {
			foundA = true
			if s.ServiceName != "Service A" {
				t.Errorf("service name: want 'Service A', got %q", s.ServiceName)
			}
			if s.QueueLength != 2 {
				t.Errorf("svc-a queue length: want 2, got %d", s.QueueLength)
			}
		}
	}
	if !foundA {
		t.Error("svc-a not found in per-service breakdown")
	}
}

func TestGetUnitQueueSummary_singleServiceOmitsBreakdown(t *testing.T) {
	t.Parallel()
	ticketRepo := &etaTicketRepo{
		waitingByUnit:    2,
		waitingByService: []repository.ServiceWaitingCount{{ServiceID: "svc-only", Count: 2}},
	}
	eta := NewETAServiceWithServiceRepo(ticketRepo, &etaCounterRepo{activeCount: 1}, &etaServiceRepo{})
	summary, err := eta.GetUnitQueueSummary("u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(summary.Services) != 0 {
		t.Errorf("single service: breakdown should be omitted, got %d entries", len(summary.Services))
	}
}

func TestGetUnitQueueSummary_zeroQueueNoETA(t *testing.T) {
	t.Parallel()
	svc := NewETAService(&etaTicketRepo{waitingByUnit: 0}, &etaCounterRepo{activeCount: 1})
	summary, err := svc.GetUnitQueueSummary("u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.EstimatedWaitMinutes != 0 {
		t.Errorf("empty queue should produce 0 ETA, got %f", summary.EstimatedWaitMinutes)
	}
}

// countingTicketRepo counts GetAvgServiceSecPerOccupiedCounter calls and can return a fixed waiting list.
type countingTicketRepo struct {
	etaTicketRepo
	getAvgCalls    int
	waitingTickets []models.Ticket
}

func (r *countingTicketRepo) GetWaitingTickets(unitID string) ([]models.Ticket, error) {
	if r.waitingTickets != nil {
		return r.waitingTickets, nil
	}
	return r.etaTicketRepo.GetWaitingTickets(unitID)
}

func (r *countingTicketRepo) GetAvgServiceSecPerOccupiedCounter(unitID string, n int) (map[string]float64, error) {
	r.getAvgCalls++
	return r.etaTicketRepo.GetAvgServiceSecPerOccupiedCounter(unitID, n)
}

func TestComputeUnitETASnapshot_fetchesOccupiedCounterSamplesOnce(t *testing.T) {
	t.Parallel()
	unitID := "u1"
	svcID := "s1"
	samples := []int{60, 60, 60, 60, 60}
	waiting := make([]models.Ticket, 20)
	for i := range waiting {
		waiting[i] = models.Ticket{
			ID:        fmt.Sprintf("t%d", i),
			Status:    "waiting",
			UnitID:    unitID,
			ServiceID: svcID,
		}
	}
	repo := &countingTicketRepo{
		etaTicketRepo: etaTicketRepo{
			recentTimes:   map[string][]int{unitID + "|" + svcID: samples},
			waitingByUnit: 20,
		},
		waitingTickets: waiting,
	}
	svc := NewETAService(repo, &etaCounterRepo{activeCount: 2})
	snap, err := svc.ComputeUnitETASnapshot(unitID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.getAvgCalls != 1 {
		t.Errorf("GetAvgServiceSecPerOccupiedCounter: want 1 call, got %d", repo.getAvgCalls)
	}
	if len(snap.Tickets) != 20 {
		t.Errorf("tickets in snapshot: want 20, got %d", len(snap.Tickets))
	}
}

func TestEffectiveServiceMinutesForUnit_usesStatisticsDailyBucketsWhenFewLiveSamples(t *testing.T) {
	t.Parallel()
	unitID := "u1"
	// No EWMA samples; unitRepo nil → time-of-day multiplier 1; bucket rollup used before raw-ticket hourly fallback.
	ticketRepo := &etaTicketRepo{
		recentTimes: map[string][]int{},
	}
	statsRepo := &etaStatsRepoStub{avgSec: 120, ok: true}
	eta := NewETAServiceFull(ticketRepo, &etaCounterRepo{activeCount: 1}, &etaServiceRepo{}, nil, statsRepo)
	min := eta.EffectiveServiceMinutesForUnit(unitID)
	if min < 1.99 || min > 2.01 {
		t.Fatalf("want ~2.0 minutes from 120s bucket rollup, got %v", min)
	}
}

// compile-time check: ensure embedded nil interfaces are correctly set up
var (
	_ repository.TicketRepository     = (*etaTicketRepo)(nil)
	_ repository.CounterRepository    = (*etaCounterRepo)(nil)
	_ repository.ServiceRepository    = (*etaServiceRepo)(nil)
	_ repository.StatisticsRepository = (*etaStatsRepoStub)(nil)
)

// suppress unused import for gorm needed by embedded interface
var _ *gorm.DB
