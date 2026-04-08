package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"
	"quokkaq-go-backend/pkg/database"
	"time"

	"gorm.io/gorm"
)

type ShiftService interface {
	GetDashboardStats(unitID string) (map[string]interface{}, error)
	GetQueueTickets(unitID string) ([]models.Ticket, error)
	GetShiftCounters(unitID string) ([]ShiftCounterDTO, error)
	ExecuteEndOfDay(ctx context.Context, unitID string, userID *string) (map[string]interface{}, error)
}

type ShiftCounterDTO struct {
	models.Counter
	IsOccupied   bool           `json:"isOccupied"`
	ActiveTicket *models.Ticket `json:"activeTicket,omitempty"`
}

type shiftService struct {
	ticketRepo   repository.TicketRepository
	counterRepo  repository.CounterRepository
	auditLogRepo repository.AuditLogRepository
	hub          *ws.Hub
}

func NewShiftService(
	ticketRepo repository.TicketRepository,
	counterRepo repository.CounterRepository,
	auditLogRepo repository.AuditLogRepository,
	hub *ws.Hub,
) ShiftService {
	return &shiftService{
		ticketRepo:   ticketRepo,
		counterRepo:  counterRepo,
		auditLogRepo: auditLogRepo,
		hub:          hub,
	}
}

func (s *shiftService) GetDashboardStats(unitID string) (map[string]interface{}, error) {
	activeCountersCount, err := s.counterRepo.CountActive(unitID)
	if err != nil {
		return nil, err
	}

	queueLength, err := s.ticketRepo.CountWaiting(unitID)
	if err != nil {
		return nil, err
	}

	waitingTickets, err := s.ticketRepo.GetWaitingTickets(unitID)
	if err != nil {
		return nil, err
	}

	var averageWaitTimeMinutes float64
	if len(waitingTickets) > 0 {
		now := time.Now()
		var totalWaitMs int64
		for _, ticket := range waitingTickets {
			totalWaitMs += now.Sub(ticket.CreatedAt).Milliseconds()
		}
		averageWaitTimeMinutes = math.Round(float64(totalWaitMs) / float64(len(waitingTickets)) / 60000)
	}

	return map[string]interface{}{
		"activeCountersCount":    activeCountersCount,
		"queueLength":            queueLength,
		"averageWaitTimeMinutes": averageWaitTimeMinutes,
	}, nil
}

func (s *shiftService) GetQueueTickets(unitID string) ([]models.Ticket, error) {
	return s.ticketRepo.GetWaitingTickets(unitID)
}

func (s *shiftService) GetShiftCounters(unitID string) ([]ShiftCounterDTO, error) {
	counters, err := s.counterRepo.FindAllByUnit(unitID)
	if err != nil {
		return nil, err
	}

	dtos := make([]ShiftCounterDTO, len(counters))
	for i, counter := range counters {
		dto := ShiftCounterDTO{
			Counter: counter,
		}

		if counter.AssignedTo != nil {
			dto.IsOccupied = true
			// Get active ticket
			activeTicket, err := s.ticketRepo.GetActiveTicketByCounter(counter.ID)
			if err == nil && activeTicket != nil {
				dto.ActiveTicket = activeTicket
			}
		}

		dtos[i] = dto
	}

	return dtos, nil
}

func (s *shiftService) ExecuteEndOfDay(ctx context.Context, unitID string, userID *string) (map[string]interface{}, error) {
	today := time.Now().Format("2006-01-02")

	var ticketsMarked int64
	var countersReleased int64

	err := database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		ticketsMarked, err = s.ticketRepo.MarkAsEODTx(tx, unitID)
		if err != nil {
			return err
		}
		countersReleased, err = s.counterRepo.ReleaseAllTx(tx, unitID)
		if err != nil {
			return err
		}
		if err := s.ticketRepo.ResetSequencesTx(tx, unitID, today); err != nil {
			return err
		}

		auditPayload := map[string]interface{}{
			"unitId":           unitID,
			"ticketsMarked":    ticketsMarked,
			"countersReleased": countersReleased,
			"timestamp":        time.Now(),
		}
		payloadBytes, err := json.Marshal(auditPayload)
		if err != nil {
			return fmt.Errorf("end of day: marshal audit payload: %w", err)
		}
		auditLog := models.AuditLog{
			UserID:  userID,
			Action:  "unit.eod",
			Payload: payloadBytes,
		}
		if err := s.auditLogRepo.CreateAuditLogTx(ctx, tx, &auditLog); err != nil {
			return fmt.Errorf("end of day: audit log: %w", err)
		}
		return nil
	})
	if err != nil {
		log.Printf("shift eod transaction failed unitId=%s err=%v", unitID, err)
		return nil, err
	}

	result := map[string]interface{}{
		"success":          true,
		"ticketsMarked":    ticketsMarked,
		"countersReleased": countersReleased,
	}

	s.hub.BroadcastEvent("unit.eod", result, unitID)

	return result, nil
}
