package services

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// ErrInvalidShiftActivityCursor is returned when the cursor query parameter cannot be decoded.
var ErrInvalidShiftActivityCursor = errors.New("invalid shift activity cursor")

type ShiftService interface {
	GetDashboardStats(unitID string) (map[string]interface{}, error)
	GetQueueTickets(unitID string) ([]models.Ticket, error)
	GetShiftCounters(unitID string) ([]ShiftCounterDTO, error)
	GetShiftActivity(unitID string, limit int, cursor string) (*ShiftActivityResponse, error)
	ExecuteEndOfDay(ctx context.Context, unitID string, userID *string) (map[string]interface{}, error)
}

// ShiftActivityItem is one row for supervisor activity feed (ticket_histories + ticket queue number).
type ShiftActivityItem struct {
	ID          string          `json:"id"`
	TicketID    string          `json:"ticketId"`
	QueueNumber string          `json:"queueNumber"`
	Action      string          `json:"action"`
	UserID      *string         `json:"userId,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty" swaggertype:"object"`
	CreatedAt   time.Time       `json:"createdAt"`
}

// ShiftActivityResponse is paginated activity for a unit.
type ShiftActivityResponse struct {
	Items      []ShiftActivityItem `json:"items"`
	NextCursor *string             `json:"nextCursor,omitempty"`
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

func encodeShiftActivityCursor(t time.Time, id string) string {
	raw := t.UTC().Format(time.RFC3339Nano) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeShiftActivityCursor(cursor string) (time.Time, string, error) {
	var zero time.Time
	if cursor == "" {
		return zero, "", errors.New("empty cursor")
	}
	b, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		b, err = base64.URLEncoding.DecodeString(cursor)
		if err != nil {
			return zero, "", fmt.Errorf("cursor: %w", err)
		}
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return zero, "", errors.New("cursor: invalid format")
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return zero, "", fmt.Errorf("cursor: time: %w", err)
	}
	if parts[1] == "" {
		return zero, "", errors.New("cursor: missing id")
	}
	return ts, parts[1], nil
}

func (s *shiftService) GetShiftActivity(unitID string, limit int, cursor string) (*ShiftActivityResponse, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	var beforeTime *time.Time
	var beforeID *string
	if cursor != "" {
		ts, id, err := decodeShiftActivityCursor(cursor)
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrInvalidShiftActivityCursor, err)
		}
		beforeTime = &ts
		beforeID = &id
	}
	rows, err := s.ticketRepo.ListTicketHistoryByUnitID(unitID, limit+1, beforeTime, beforeID)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]ShiftActivityItem, 0, len(rows))
	for _, row := range rows {
		var raw json.RawMessage
		if len(row.Payload) > 0 {
			raw = json.RawMessage(row.Payload)
		} else {
			raw = json.RawMessage([]byte("{}"))
		}
		items = append(items, ShiftActivityItem{
			ID:          row.ID,
			TicketID:    row.TicketID,
			QueueNumber: row.QueueNumber,
			Action:      row.Action,
			UserID:      row.UserID,
			Payload:     raw,
			CreatedAt:   row.CreatedAt,
		})
	}
	resp := &ShiftActivityResponse{Items: items}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		nc := encodeShiftActivityCursor(last.CreatedAt, last.ID)
		resp.NextCursor = &nc
	}
	return resp, nil
}

func (s *shiftService) ExecuteEndOfDay(ctx context.Context, unitID string, userID *string) (map[string]interface{}, error) {
	today := time.Now().Format("2006-01-02")

	var ticketsMarked int64
	var countersReleased int64
	var waitingTicketsNoShow int64
	var activeTicketsClosed int64

	err := database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		waitingTicketsNoShow, activeTicketsClosed, err = s.ticketRepo.CountEODTicketSplitTx(tx, unitID)
		if err != nil {
			return err
		}
		eodIDs, err := s.ticketRepo.AppendEODFlaggedHistoryForUnitTx(tx, unitID, userID)
		if err != nil {
			return fmt.Errorf("end of day: ticket history: %w", err)
		}
		ticketsMarked, err = s.ticketRepo.MarkAsEODTicketIDsTx(tx, eodIDs)
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
			"unitId":               unitID,
			"ticketsMarked":        ticketsMarked,
			"waitingTicketsNoShow": waitingTicketsNoShow,
			"activeTicketsClosed":  activeTicketsClosed,
			"countersReleased":     countersReleased,
			"timestamp":            time.Now(),
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
		"success":              true,
		"ticketsMarked":        ticketsMarked,
		"activeTicketsClosed":  activeTicketsClosed,
		"waitingTicketsNoShow": waitingTicketsNoShow,
		"countersReleased":     countersReleased,
	}

	s.hub.BroadcastEvent("unit.eod", result, unitID)

	return result, nil
}
