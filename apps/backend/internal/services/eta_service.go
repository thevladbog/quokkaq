package services

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

const (
	etaRecentSampleSize   = 20
	etaMinSamplesRequired = 3
	etaFallbackMultiplier = 1 // multiply avg waiting time by this when no service history
)

// ETAService computes estimated wait time and queue position for tickets.
type ETAService struct {
	ticketRepo  repository.TicketRepository
	counterRepo repository.CounterRepository
}

// NewETAService creates a new ETAService.
func NewETAService(ticketRepo repository.TicketRepository, counterRepo repository.CounterRepository) *ETAService {
	return &ETAService{
		ticketRepo:  ticketRepo,
		counterRepo: counterRepo,
	}
}

// QueuePositionResult holds position and ETA for a ticket.
type QueuePositionResult struct {
	Position         int `json:"queuePosition"`
	EstimatedWaitSec int `json:"estimatedWaitSeconds"`
}

// QueuePositionAndETA computes the 1-based queue position and an estimated wait in seconds
// for a waiting ticket. Returns zeros for non-waiting tickets (no estimation needed).
func (s *ETAService) QueuePositionAndETA(ticket *models.Ticket) (QueuePositionResult, error) {
	if ticket.Status != "waiting" {
		return QueuePositionResult{}, nil
	}

	position, err := s.ticketRepo.GetQueuePosition(ticket)
	if err != nil {
		return QueuePositionResult{}, err
	}

	etaSec, err := s.estimateWaitSeconds(ticket, position)
	if err != nil {
		// Non-fatal: return position with zero ETA rather than propagating.
		return QueuePositionResult{Position: position}, nil
	}

	return QueuePositionResult{
		Position:         position,
		EstimatedWaitSec: etaSec,
	}, nil
}

// UnitQueueSummary returns a lightweight summary for the public queue-status endpoint.
type UnitQueueSummary struct {
	QueueLength          int64   `json:"queueLength"`
	EstimatedWaitMinutes float64 `json:"estimatedWaitMinutes"`
	ActiveCounters       int64   `json:"activeCounters"`
}

// GetUnitQueueSummary returns queue length, estimated wait (minutes), and active counter count
// for a given unit. Intended for unauthenticated public callers.
func (s *ETAService) GetUnitQueueSummary(unitID string) (UnitQueueSummary, error) {
	queueLength, err := s.ticketRepo.CountWaitingByUnit(unitID)
	if err != nil {
		return UnitQueueSummary{}, err
	}

	activeCounters, err := s.counterRepo.CountActive(unitID)
	if err != nil {
		return UnitQueueSummary{}, err
	}

	var estimatedWaitMinutes float64
	if queueLength > 0 {
		// Use rolling average service time across all services in the unit as a proxy.
		// We estimate ETA for the last position in the current queue.
		avgServiceSec, sErr := s.rollingAvgServiceSec(unitID, "")
		if sErr == nil && avgServiceSec > 0 {
			divisor := activeCounters
			if divisor <= 0 {
				divisor = 1
			}
			totalSec := float64(queueLength) * float64(avgServiceSec) / float64(divisor)
			estimatedWaitMinutes = totalSec / 60.0
		}
	}

	return UnitQueueSummary{
		QueueLength:          queueLength,
		EstimatedWaitMinutes: estimatedWaitMinutes,
		ActiveCounters:       activeCounters,
	}, nil
}

// estimateWaitSeconds estimates how long in seconds `ticket` at `position` will wait.
// Algorithm: position × avgServiceTime / max(1, activeCounters).
// Falls back to MaxWaitingTime from the service snapshot when insufficient data.
func (s *ETAService) estimateWaitSeconds(ticket *models.Ticket, position int) (int, error) {
	avgSec, err := s.rollingAvgServiceSec(ticket.UnitID, ticket.ServiceID)
	if err != nil || avgSec <= 0 {
		// Fall back to MaxWaitingTime snapshot if available.
		if ticket.MaxWaitingTime != nil && *ticket.MaxWaitingTime > 0 {
			return *ticket.MaxWaitingTime, nil
		}
		return 0, nil
	}

	activeCounters, err := s.counterRepo.CountActive(ticket.UnitID)
	if err != nil || activeCounters <= 0 {
		activeCounters = 1
	}

	etaSec := (position * avgSec) / int(activeCounters)
	return etaSec, nil
}

// rollingAvgServiceSec returns the average service duration in seconds over the last
// etaRecentSampleSize completed tickets. When serviceID is empty, uses unit-wide data.
func (s *ETAService) rollingAvgServiceSec(unitID, serviceID string) (int, error) {
	var samples []int
	var err error
	if serviceID != "" {
		samples, err = s.ticketRepo.GetRecentCompletedServiceTimes(unitID, serviceID, etaRecentSampleSize)
	} else {
		samples, err = s.ticketRepo.GetRecentCompletedServiceTimes(unitID, "", etaRecentSampleSize)
	}
	if err != nil {
		return 0, err
	}
	if len(samples) < etaMinSamplesRequired {
		return 0, nil
	}
	var total int
	for _, d := range samples {
		total += d
	}
	return total / len(samples), nil
}
