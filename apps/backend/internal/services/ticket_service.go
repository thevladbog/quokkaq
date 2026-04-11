package services

import (
	"errors"
	"fmt"
	"log/slog"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ticketaudit"
	"quokkaq-go-backend/internal/ws"

	"gorm.io/gorm"
)

type TicketService interface {
	CreateTicket(unitID, serviceID string, actorUserID *string) (*models.Ticket, error)
	CreateTicketWithPreRegistration(unitID, serviceID, preRegID string, actorUserID *string) (*models.Ticket, error)
	GetTicketByID(id string) (*models.Ticket, error)
	GetTicketsByUnit(unitID string) ([]models.Ticket, error)
	Recall(ticketID string, actorUserID *string) (*models.Ticket, error)
	Pick(ticketID, counterID string, actorUserID *string) (*models.Ticket, error)
	Transfer(ticketID string, toCounterID, toUserID *string, actorUserID *string) (*models.Ticket, error)
	ReturnToQueue(ticketID string, actorUserID *string) (*models.Ticket, error)
	CallNext(unitID, counterID string, serviceID *string, actorUserID *string) (*models.Ticket, error)
	UpdateStatus(ticketID, status string, actorUserID *string) (*models.Ticket, error)
}

type ticketService struct {
	repo        repository.TicketRepository
	counterRepo repository.CounterRepository
	serviceRepo repository.ServiceRepository
	hub         *ws.Hub
	jobClient   JobEnqueuer
	log         *slog.Logger
}

func NewTicketService(repo repository.TicketRepository, counterRepo repository.CounterRepository, serviceRepo repository.ServiceRepository, hub *ws.Hub, jobClient JobEnqueuer) TicketService {
	return &ticketService{
		repo:        repo,
		counterRepo: counterRepo,
		serviceRepo: serviceRepo,
		hub:         hub,
		jobClient:   jobClient,
		log:         slog.Default(),
	}
}

func (s *ticketService) writeTicketHistoryTx(tx *gorm.DB, ticketID string, actorUserID *string, action string, payload map[string]interface{}) error {
	h, err := ticketaudit.NewHistory(ticketID, action, actorUserID, payload)
	if err != nil {
		return err
	}
	return s.repo.CreateTicketHistoryTx(tx, h)
}

func (s *ticketService) CreateTicket(unitID, serviceID string, actorUserID *string) (*models.Ticket, error) {
	return s.createTicketInternal(unitID, serviceID, nil, actorUserID)
}

func (s *ticketService) CreateTicketWithPreRegistration(unitID, serviceID, preRegID string, actorUserID *string) (*models.Ticket, error) {
	return s.createTicketInternal(unitID, serviceID, &preRegID, actorUserID)
}

func (s *ticketService) createTicketInternal(unitID, serviceID string, preRegID *string, actorUserID *string) (*models.Ticket, error) {
	// Generate Queue Number
	date := time.Now().Format("2006-01-02")
	seq, err := s.repo.GetNextSequence(unitID, serviceID, date)
	if err != nil {
		return nil, err
	}

	// Fetch service to get prefix
	service, err := s.serviceRepo.FindByID(serviceID)
	if err != nil {
		return nil, err
	}

	queueNumber := fmt.Sprintf("%03d", seq)
	if service.Prefix != nil && *service.Prefix != "" {
		queueNumber = fmt.Sprintf("%s-%03d", *service.Prefix, seq)
	}

	ticket := &models.Ticket{
		UnitID:            unitID,
		ServiceID:         serviceID,
		QueueNumber:       queueNumber,
		Status:            "waiting",
		CreatedAt:         time.Now(),
		MaxWaitingTime:    service.MaxWaitingTime,
		PreRegistrationID: preRegID,
	}

	payload := map[string]interface{}{
		"unit_id":    unitID,
		"service_id": serviceID,
		"status":     "waiting",
	}
	if preRegID != nil {
		payload["pre_registration_id"] = *preRegID
		payload["source"] = "pre_registration_redeem"
	} else {
		payload["source"] = "public_issue"
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.CreateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketCreated, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.created", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) GetTicketByID(id string) (*models.Ticket, error) {
	return s.repo.FindByID(id)
}

func (s *ticketService) GetTicketsByUnit(unitID string) ([]models.Ticket, error) {
	return s.repo.FindByUnitID(unitID)
}

func (s *ticketService) CallNext(unitID, counterID string, serviceID *string, actorUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindWaiting(unitID, serviceID)
	if err != nil {
		return nil, errors.New("no waiting tickets")
	}

	fromStatus := ticket.Status
	now := time.Now()
	ticket.Status = "called"
	ticket.CounterID = &counterID
	ticket.CalledAt = &now

	payload := map[string]interface{}{
		"unit_id":     ticket.UnitID,
		"service_id":  ticket.ServiceID,
		"counter_id":  counterID,
		"from_status": fromStatus,
		"to_status":   "called",
		"source":      "unit_call_next",
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketCalled, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	// Enqueue TTS Job
	s.enqueueTTS(ticket, counterID)

	return ticket, nil
}

func (s *ticketService) UpdateStatus(ticketID, status string, actorUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	fromStatus := ticket.Status
	ticket.Status = status
	now := time.Now()

	switch status {
	case "served":
		ticket.CompletedAt = &now
	case "no_show":
		ticket.CompletedAt = &now
	case "in_service":
		ticket.ConfirmedAt = &now
	}

	payload := map[string]interface{}{
		"unit_id":     ticket.UnitID,
		"from_status": fromStatus,
		"to_status":   status,
		"reason":      "api_status_patch",
	}
	if ticket.CounterID != nil {
		payload["counter_id"] = *ticket.CounterID
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketStatusChanged, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) Recall(ticketID string, actorUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	ticket.Status = "called"
	ticket.LastCalledAt = &now

	payload := map[string]interface{}{
		"unit_id":    ticket.UnitID,
		"service_id": ticket.ServiceID,
		"status":     ticket.Status,
	}
	if ticket.CounterID != nil {
		payload["counter_id"] = *ticket.CounterID
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketRecalled, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	if ticket.CounterID != nil {
		s.enqueueTTS(ticket, *ticket.CounterID)
	}

	return ticket, nil
}

func (s *ticketService) Pick(ticketID, counterID string, actorUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	fromStatus := ticket.Status
	now := time.Now()
	ticket.Status = "called"
	ticket.CounterID = &counterID
	ticket.CalledAt = &now

	payload := map[string]interface{}{
		"unit_id":     ticket.UnitID,
		"service_id":  ticket.ServiceID,
		"counter_id":  counterID,
		"from_status": fromStatus,
		"to_status":   "called",
		"source":      "pick",
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketCalled, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)
	s.enqueueTTS(ticket, counterID)

	return ticket, nil
}

func (s *ticketService) Transfer(ticketID string, toCounterID, toUserID *string, actorUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	fromStatus := ticket.Status
	var fromCounterID *string
	if ticket.CounterID != nil {
		c := *ticket.CounterID
		fromCounterID = &c
	}

	var targetCounterID string

	if toCounterID != nil {
		targetCounterID = *toCounterID
	} else if toUserID != nil {
		// Find counter by user ID
		counter, err := s.counterRepo.FindByUserID(*toUserID)
		if err != nil {
			return nil, errors.New("counter not found for user")
		}
		targetCounterID = counter.ID
	} else {
		return nil, errors.New("target counter or user required")
	}

	ticket.CounterID = &targetCounterID
	ticket.Status = "waiting" // Back to waiting but assigned to a counter? Or just waiting in general?
	// If we assign a counter, it might be "waiting for that counter".
	// For now, let's set it to waiting.

	payload := map[string]interface{}{
		"unit_id":       ticket.UnitID,
		"service_id":    ticket.ServiceID,
		"from_status":   fromStatus,
		"to_status":     "waiting",
		"to_counter_id": targetCounterID,
	}
	if toUserID != nil {
		payload["target_user_id"] = *toUserID
	}
	if fromCounterID != nil {
		payload["from_counter_id"] = *fromCounterID
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketTransferred, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) ReturnToQueue(ticketID string, actorUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	fromStatus := ticket.Status
	var fromCounterID *string
	if ticket.CounterID != nil {
		c := *ticket.CounterID
		fromCounterID = &c
	}

	ticket.Status = "waiting"
	ticket.CounterID = nil
	ticket.CalledAt = nil
	ticket.ConfirmedAt = nil

	payload := map[string]interface{}{
		"unit_id":     ticket.UnitID,
		"service_id":  ticket.ServiceID,
		"from_status": fromStatus,
		"to_status":   "waiting",
	}
	if fromCounterID != nil {
		payload["from_counter_id"] = *fromCounterID
	}
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketReturnedToQueue, payload)
	}); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) enqueueTTS(ticket *models.Ticket, counterID string) {
	// Fetch counter name from repository
	counterName := counterID
	if counter, err := s.counterRepo.FindByID(counterID); err == nil {
		counterName = counter.Name
	}

	err := s.jobClient.EnqueueTtsGenerate(TtsJobPayload{
		TicketID:    ticket.ID,
		QueueNumber: ticket.QueueNumber,
		UnitID:      ticket.UnitID,
		CounterName: counterName,
	})
	if err != nil {
		s.log.Error("failed to enqueue TTS job",
			slog.String("ticket_id", ticket.ID),
			slog.String("queue_number", ticket.QueueNumber),
			slog.String("unit_id", ticket.UnitID),
			slog.String("counter_name", counterName),
			slog.Any("error", err),
		)
	}
}
