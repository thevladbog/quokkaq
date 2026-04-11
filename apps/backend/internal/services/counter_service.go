package services

import (
	"errors"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ticketaudit"
)

type CounterService interface {
	CreateCounter(counter *models.Counter) error
	GetCountersByUnit(unitID string) ([]models.Counter, error)
	GetCounterByID(id string) (*models.Counter, error)
	UpdateCounter(counter *models.Counter) error
	DeleteCounter(id string) error
	Occupy(counterID, userID string) (*models.Counter, error)
	Release(counterID string) (*models.Counter, error)
	ForceRelease(counterID string, actorUserID *string) (*models.Counter, *models.Ticket, error)
	CallNext(counterID string, serviceID *string, actorUserID *string) (*models.Ticket, error)
}

type counterService struct {
	repo       repository.CounterRepository
	ticketRepo repository.TicketRepository
	userRepo   repository.UserRepository
}

func NewCounterService(repo repository.CounterRepository, ticketRepo repository.TicketRepository, userRepo repository.UserRepository) CounterService {
	return &counterService{repo: repo, ticketRepo: ticketRepo, userRepo: userRepo}
}

func (s *counterService) writeTicketHistory(ticketID string, actorUserID *string, action string, payload map[string]interface{}) error {
	h, err := ticketaudit.NewHistory(ticketID, action, actorUserID, payload)
	if err != nil {
		return err
	}
	return s.ticketRepo.CreateTicketHistory(h)
}

func (s *counterService) CreateCounter(counter *models.Counter) error {
	if counter.UnitID == "" {
		return errors.New("unit ID is required")
	}
	return s.repo.Create(counter)
}

func (s *counterService) GetCountersByUnit(unitID string) ([]models.Counter, error) {
	counters, err := s.repo.FindAllByUnit(unitID)
	if err != nil {
		return nil, err
	}

	// Populate AssignedUser
	for i := range counters {
		if counters[i].AssignedTo != nil {
			user, err := s.userRepo.FindByID(*counters[i].AssignedTo)
			if err == nil {
				counters[i].AssignedUser = user
			} else {
				// User not found (deleted or invalid ID), return placeholder
				counters[i].AssignedUser = &models.User{
					ID:   *counters[i].AssignedTo,
					Name: "Unknown User",
				}
			}
		}
	}

	return counters, nil
}

func (s *counterService) GetCounterByID(id string) (*models.Counter, error) {
	counter, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}

	if counter.AssignedTo != nil {
		user, err := s.userRepo.FindByID(*counter.AssignedTo)
		if err == nil {
			counter.AssignedUser = user
		}
	}

	return counter, nil
}

func (s *counterService) UpdateCounter(counter *models.Counter) error {
	return s.repo.Update(counter)
}

func (s *counterService) DeleteCounter(id string) error {
	return s.repo.Delete(id)
}

func (s *counterService) Occupy(counterID, userID string) (*models.Counter, error) {
	counter, err := s.repo.FindByID(counterID)
	if err != nil {
		return nil, err
	}

	if counter.AssignedTo != nil && *counter.AssignedTo != userID {
		return nil, errors.New("counter already occupied")
	}

	counter.AssignedTo = &userID
	if err := s.repo.Update(counter); err != nil {
		return nil, err
	}

	user, err := s.userRepo.FindByID(userID)
	if err == nil {
		counter.AssignedUser = user
	}

	return counter, nil
}

func (s *counterService) Release(counterID string) (*models.Counter, error) {
	counter, err := s.repo.FindByID(counterID)
	if err != nil {
		return nil, err
	}

	counter.AssignedTo = nil
	if err := s.repo.Update(counter); err != nil {
		return nil, err
	}

	return counter, nil
}

func (s *counterService) ForceRelease(counterID string, actorUserID *string) (*models.Counter, *models.Ticket, error) {
	counter, err := s.repo.FindByID(counterID)
	if err != nil {
		return nil, nil, err
	}

	// Find active ticket for this counter
	activeTicket, err := s.ticketRepo.GetActiveTicketByCounter(counterID)
	if err == nil && activeTicket != nil {
		// Mark the active ticket as completed when force releasing
		fromStatus := activeTicket.Status
		now := time.Now()
		activeTicket.Status = "completed"
		activeTicket.CompletedAt = &now
		if err := s.ticketRepo.Update(activeTicket); err != nil {
			return nil, nil, err
		}
		payload := map[string]interface{}{
			"unit_id":     activeTicket.UnitID,
			"service_id":  activeTicket.ServiceID,
			"counter_id":  counterID,
			"from_status": fromStatus,
			"to_status":   "completed",
			"reason":      "force_release",
		}
		if err := s.writeTicketHistory(activeTicket.ID, actorUserID, ticketaudit.ActionTicketStatusChanged, payload); err != nil {
			return nil, nil, err
		}
	}

	counter.AssignedTo = nil
	if err := s.repo.Update(counter); err != nil {
		return nil, nil, err
	}

	return counter, activeTicket, nil
}

func (s *counterService) CallNext(counterID string, serviceID *string, actorUserID *string) (*models.Ticket, error) {
	counter, err := s.repo.FindByID(counterID)
	if err != nil {
		return nil, err
	}

	// Find next waiting ticket
	ticket, err := s.ticketRepo.FindWaiting(counter.UnitID, serviceID)
	if err != nil {
		return nil, err // Likely "record not found" if no tickets
	}

	// Update ticket status
	fromStatus := ticket.Status
	now := time.Now()
	ticket.Status = "called"
	ticket.CounterID = &counterID
	ticket.CalledAt = &now

	if err := s.ticketRepo.Update(ticket); err != nil {
		return nil, err
	}

	payload := map[string]interface{}{
		"unit_id":     ticket.UnitID,
		"service_id":  ticket.ServiceID,
		"counter_id":  counterID,
		"from_status": fromStatus,
		"to_status":   "called",
		"source":      "counter_call_next",
	}
	if err := s.writeTicketHistory(ticket.ID, actorUserID, ticketaudit.ActionTicketCalled, payload); err != nil {
		return nil, err
	}

	return ticket, nil
}
