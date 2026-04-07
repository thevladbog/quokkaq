package services

import (
	"errors"
	"fmt"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ws"
)

type TicketService interface {
	CreateTicket(unitID, serviceID string) (*models.Ticket, error)
	CreateTicketWithPreRegistration(unitID, serviceID, preRegID string) (*models.Ticket, error)
	GetTicketByID(id string) (*models.Ticket, error)
	GetTicketsByUnit(unitID string) ([]models.Ticket, error)
	Recall(ticketID string) (*models.Ticket, error)
	Pick(ticketID, counterID string) (*models.Ticket, error)
	Transfer(ticketID string, toCounterID, toUserID *string) (*models.Ticket, error)
	ReturnToQueue(ticketID string) (*models.Ticket, error)
	CallNext(unitID, counterID string, serviceID *string) (*models.Ticket, error)
	UpdateStatus(ticketID, status string) (*models.Ticket, error)
}

type ticketService struct {
	repo        repository.TicketRepository
	counterRepo repository.CounterRepository
	serviceRepo repository.ServiceRepository
	hub         *ws.Hub
	jobClient   JobEnqueuer
}

func NewTicketService(repo repository.TicketRepository, counterRepo repository.CounterRepository, serviceRepo repository.ServiceRepository, hub *ws.Hub, jobClient JobEnqueuer) TicketService {
	return &ticketService{repo: repo, counterRepo: counterRepo, serviceRepo: serviceRepo, hub: hub, jobClient: jobClient}
}

func (s *ticketService) CreateTicket(unitID, serviceID string) (*models.Ticket, error) {
	return s.createTicketInternal(unitID, serviceID, nil)
}

func (s *ticketService) CreateTicketWithPreRegistration(unitID, serviceID, preRegID string) (*models.Ticket, error) {
	return s.createTicketInternal(unitID, serviceID, &preRegID)
}

func (s *ticketService) createTicketInternal(unitID, serviceID string, preRegID *string) (*models.Ticket, error) {
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

	if err := s.repo.Create(ticket); err != nil {
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

func (s *ticketService) CallNext(unitID, counterID string, serviceID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindWaiting(unitID, serviceID)
	if err != nil {
		return nil, errors.New("no waiting tickets")
	}

	now := time.Now()
	ticket.Status = "called"
	ticket.CounterID = &counterID
	ticket.CalledAt = &now

	if err := s.repo.Update(ticket); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	// Enqueue TTS Job
	s.enqueueTTS(ticket, counterID)

	return ticket, nil
}

func (s *ticketService) UpdateStatus(ticketID, status string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

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

	if err := s.repo.Update(ticket); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) Recall(ticketID string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	ticket.Status = "called"
	ticket.LastCalledAt = &now

	if err := s.repo.Update(ticket); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	if ticket.CounterID != nil {
		s.enqueueTTS(ticket, *ticket.CounterID)
	}

	return ticket, nil
}

func (s *ticketService) Pick(ticketID, counterID string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	ticket.Status = "called"
	ticket.CounterID = &counterID
	ticket.CalledAt = &now

	if err := s.repo.Update(ticket); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)
	s.enqueueTTS(ticket, counterID)

	return ticket, nil
}

func (s *ticketService) Transfer(ticketID string, toCounterID, toUserID *string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
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

	if err := s.repo.Update(ticket); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) ReturnToQueue(ticketID string) (*models.Ticket, error) {
	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}

	ticket.Status = "waiting"
	ticket.CounterID = nil
	ticket.CalledAt = nil
	ticket.ConfirmedAt = nil

	if err := s.repo.Update(ticket); err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) enqueueTTS(ticket *models.Ticket, counterID string) {
	// TODO: Fetch counter name if counterID is UUID
	// For now assuming counterID might be name or we need to fetch it.
	// Ideally we should fetch the counter to get its name.
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
		fmt.Printf("Failed to enqueue TTS job: %v\n", err)
	}
}
