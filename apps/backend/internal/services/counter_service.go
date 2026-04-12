package services

import (
	"errors"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ticketaudit"
	"quokkaq-go-backend/internal/ws"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// ErrCounterOnBreak is returned when call-next/pick is attempted while the counter is on break.
var ErrCounterOnBreak = errors.New("counter is on break; end break before calling tickets")

// ErrCounterBreakActiveTicket is returned when starting a break while a ticket is active at the counter.
var ErrCounterBreakActiveTicket = errors.New("cannot start break while a ticket is active at this counter")

// ErrCounterNotOccupiedByUser is returned when the current user does not occupy the counter.
var ErrCounterNotOccupiedByUser = errors.New("counter is not occupied by this user")

// ErrCounterAlreadyOnBreak is returned when break/start is requested but the counter is already on break.
var ErrCounterAlreadyOnBreak = errors.New("counter is already on break")

// ErrCounterNotOnBreak is returned when break/end is requested but the counter is not on break.
var ErrCounterNotOnBreak = errors.New("counter is not on break")

type CounterService interface {
	CreateCounter(counter *models.Counter) error
	GetCountersByUnit(unitID string) ([]models.Counter, error)
	GetCounterByID(id string) (*models.Counter, error)
	UpdateCounter(counter *models.Counter) error
	DeleteCounter(id string) error
	Occupy(counterID, userID string) (*models.Counter, error)
	Release(counterID string) (*models.Counter, error)
	ForceRelease(counterID string, actorUserID *string) (*models.Counter, *models.Ticket, error)
	CallNext(counterID string, serviceIDs []string, actorUserID *string) (*models.Ticket, error)
	StartBreak(counterID, userID string) (*models.Counter, error)
	EndBreak(counterID, userID string) (*models.Counter, error)
}

type counterService struct {
	repo         repository.CounterRepository
	ticketRepo   repository.TicketRepository
	serviceRepo  repository.ServiceRepository
	userRepo     repository.UserRepository
	unitRepo     repository.UnitRepository
	intervalRepo repository.OperatorIntervalRepository
	hub          *ws.Hub
}

func NewCounterService(
	repo repository.CounterRepository,
	ticketRepo repository.TicketRepository,
	serviceRepo repository.ServiceRepository,
	userRepo repository.UserRepository,
	intervalRepo repository.OperatorIntervalRepository,
	unitRepo repository.UnitRepository,
	hub *ws.Hub,
) CounterService {
	return &counterService{
		repo:         repo,
		ticketRepo:   ticketRepo,
		serviceRepo:  serviceRepo,
		userRepo:     userRepo,
		unitRepo:     unitRepo,
		intervalRepo: intervalRepo,
		hub:          hub,
	}
}

func (s *counterService) broadcastCounterUpdated(counter *models.Counter) {
	if s.hub == nil || counter == nil {
		return
	}
	s.hub.BroadcastEvent("counter.updated", counter, counter.UnitID)
}

func (s *counterService) hydrateBreakStartedAt(c *models.Counter) {
	if c == nil {
		return
	}
	if !c.OnBreak {
		c.BreakStartedAt = nil
		return
	}
	ts, err := s.intervalRepo.GetOpenBreakStartTime(c.ID)
	if err != nil || ts == nil {
		c.BreakStartedAt = nil
		return
	}
	c.BreakStartedAt = ts
}

func (s *counterService) CreateCounter(counter *models.Counter) error {
	if counter.UnitID == "" {
		return errors.New("unit ID is required")
	}
	if err := ValidateOptionalChildServiceZone(s.unitRepo, counter.UnitID, counter.ServiceZoneID); err != nil {
		return err
	}
	return s.repo.Create(counter)
}

func (s *counterService) GetCountersByUnit(unitID string) ([]models.Counter, error) {
	counters, err := s.repo.FindAllByUnit(unitID)
	if err != nil {
		return nil, err
	}

	for i := range counters {
		if counters[i].AssignedTo != nil {
			user, err := s.userRepo.FindByID(*counters[i].AssignedTo)
			if err == nil {
				counters[i].AssignedUser = user
			} else {
				counters[i].AssignedUser = &models.User{
					ID:   *counters[i].AssignedTo,
					Name: "Unknown User",
				}
			}
		}
		s.hydrateBreakStartedAt(&counters[i])
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
	s.hydrateBreakStartedAt(counter)

	return counter, nil
}

func (s *counterService) UpdateCounter(counter *models.Counter) error {
	existing, err := s.repo.FindByID(counter.ID)
	if err != nil {
		return err
	}
	counter.UnitID = existing.UnitID
	if err := ValidateOptionalChildServiceZone(s.unitRepo, counter.UnitID, counter.ServiceZoneID); err != nil {
		return err
	}
	return s.repo.Update(counter)
}

func (s *counterService) DeleteCounter(id string) error {
	return s.repo.Delete(id)
}

func (s *counterService) Occupy(counterID, userID string) (*models.Counter, error) {
	var counter *models.Counter
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		c, err := s.repo.FindByIDTx(tx, counterID)
		if err != nil {
			return err
		}
		if c.AssignedTo != nil && *c.AssignedTo != userID {
			return errors.New("counter already occupied")
		}
		if _, err := s.intervalRepo.CloseOpenIntervalsForCounterTx(tx, counterID, now); err != nil {
			return err
		}
		c.AssignedTo = &userID
		c.OnBreak = false
		if err := s.repo.UpdateTx(tx, c); err != nil {
			return err
		}
		if err := insertOperatorIntervalTx(tx, s.intervalRepo, c.UnitID, counterID, userID, models.OperatorIntervalKindIdle, now); err != nil {
			return err
		}
		counter = c
		return nil
	})
	if err != nil {
		return nil, err
	}

	user, err := s.userRepo.FindByID(userID)
	if err == nil {
		counter.AssignedUser = user
	}
	s.hydrateBreakStartedAt(counter)
	s.broadcastCounterUpdated(counter)
	return counter, nil
}

func (s *counterService) Release(counterID string) (*models.Counter, error) {
	var counter *models.Counter
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		c, err := s.repo.FindByIDTx(tx, counterID)
		if err != nil {
			return err
		}
		if _, err := s.intervalRepo.CloseOpenIntervalsForCounterTx(tx, counterID, now); err != nil {
			return err
		}
		c.AssignedTo = nil
		c.OnBreak = false
		if err := s.repo.UpdateTx(tx, c); err != nil {
			return err
		}
		counter = c
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.hydrateBreakStartedAt(counter)
	s.broadcastCounterUpdated(counter)
	return counter, nil
}

func (s *counterService) ForceRelease(counterID string, actorUserID *string) (*models.Counter, *models.Ticket, error) {
	var counter *models.Counter
	var activeTicket *models.Ticket

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		at, err := s.ticketRepo.GetActiveTicketByCounterTx(tx, counterID)
		if err != nil {
			return err
		}
		activeTicket = at

		if activeTicket != nil {
			fromStatus := activeTicket.Status
			now := time.Now()
			activeTicket.Status = "completed"
			activeTicket.CompletedAt = &now
			payload := map[string]interface{}{
				"unit_id":     activeTicket.UnitID,
				"service_id":  activeTicket.ServiceID,
				"counter_id":  counterID,
				"from_status": fromStatus,
				"to_status":   "completed",
				"reason":      "force_release",
			}
			if err := s.ticketRepo.UpdateTx(tx, activeTicket); err != nil {
				return err
			}
			h, err := ticketaudit.NewHistory(
				activeTicket.ID,
				ticketaudit.ActionTicketStatusChanged,
				actorUserID,
				payload,
			)
			if err != nil {
				return err
			}
			if err := s.ticketRepo.CreateTicketHistoryTx(tx, h); err != nil {
				return err
			}
		}

		now := time.Now()
		if _, err := s.intervalRepo.CloseOpenIntervalsForCounterTx(tx, counterID, now); err != nil {
			return err
		}
		c, err := s.repo.FindByIDTx(tx, counterID)
		if err != nil {
			return err
		}
		c.AssignedTo = nil
		c.OnBreak = false
		if err := s.repo.UpdateTx(tx, c); err != nil {
			return err
		}
		counter = c
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	s.hydrateBreakStartedAt(counter)
	s.broadcastCounterUpdated(counter)
	return counter, activeTicket, nil
}

func (s *counterService) StartBreak(counterID, userID string) (*models.Counter, error) {
	var counter *models.Counter
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		c, err := s.repo.FindByIDTx(tx, counterID)
		if err != nil {
			return err
		}
		if c.AssignedTo == nil || *c.AssignedTo != userID {
			return ErrCounterNotOccupiedByUser
		}
		if c.OnBreak {
			return ErrCounterAlreadyOnBreak
		}
		active, err := s.ticketRepo.GetActiveTicketByCounterTx(tx, counterID)
		if err != nil {
			return err
		}
		if active != nil {
			return ErrCounterBreakActiveTicket
		}
		if _, err := s.intervalRepo.CloseOpenIntervalsForCounterTx(tx, counterID, now); err != nil {
			return err
		}
		c.OnBreak = true
		if err := s.repo.UpdateTx(tx, c); err != nil {
			return err
		}
		if err := insertOperatorIntervalTx(tx, s.intervalRepo, c.UnitID, counterID, userID, models.OperatorIntervalKindBreak, now); err != nil {
			return err
		}
		counter = c
		return nil
	})
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.FindByID(userID)
	if err == nil {
		counter.AssignedUser = user
	}
	s.hydrateBreakStartedAt(counter)
	s.broadcastCounterUpdated(counter)
	return counter, nil
}

func (s *counterService) EndBreak(counterID, userID string) (*models.Counter, error) {
	var counter *models.Counter
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		c, err := s.repo.FindByIDTx(tx, counterID)
		if err != nil {
			return err
		}
		if c.AssignedTo == nil || *c.AssignedTo != userID {
			return ErrCounterNotOccupiedByUser
		}
		if !c.OnBreak {
			return ErrCounterNotOnBreak
		}
		if _, err := s.intervalRepo.CloseOpenIntervalsForCounterTx(tx, counterID, now); err != nil {
			return err
		}
		c.OnBreak = false
		if err := s.repo.UpdateTx(tx, c); err != nil {
			return err
		}
		if err := insertOperatorIntervalTx(tx, s.intervalRepo, c.UnitID, counterID, userID, models.OperatorIntervalKindIdle, now); err != nil {
			return err
		}
		counter = c
		return nil
	})
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.FindByID(userID)
	if err == nil {
		counter.AssignedUser = user
	}
	s.hydrateBreakStartedAt(counter)
	s.broadcastCounterUpdated(counter)
	return counter, nil
}

func (s *counterService) CallNext(counterID string, serviceIDs []string, actorUserID *string) (*models.Ticket, error) {
	counter, err := s.repo.FindByID(counterID)
	if err != nil {
		return nil, err
	}

	if len(serviceIDs) > 0 {
		n, err := s.serviceRepo.CountByUnitAndIDs(counter.UnitID, serviceIDs)
		if err != nil {
			return nil, err
		}
		if int(n) != len(serviceIDs) {
			return nil, ErrCallNextInvalidServices
		}
	}

	ticket, err := s.ticketRepo.FindWaiting(counter.UnitID, serviceIDs, counter.ServiceZoneID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNoWaitingTickets
		}
		return nil, err
	}

	fromStatus := ticket.Status
	now := time.Now()

	err = s.ticketRepo.Transaction(func(tx *gorm.DB) error {
		c, err := s.repo.FindByIDForUpdateTx(tx, counterID)
		if err != nil {
			return err
		}
		if c.OnBreak {
			return ErrCounterOnBreak
		}
		t, err := s.ticketRepo.FindByIDForUpdateTx(tx, ticket.ID)
		if err != nil {
			return err
		}
		if t.Status != "waiting" {
			return ErrNoWaitingTickets
		}
		t.Status = "called"
		t.CounterID = &counterID
		t.CalledAt = &now
		if err := s.ticketRepo.UpdateTx(tx, t); err != nil {
			return err
		}
		ticket = t
		if err := closeIdleOnCallTx(tx, s.intervalRepo, counterID, now); err != nil {
			return err
		}
		payload := map[string]interface{}{
			"unit_id":     ticket.UnitID,
			"service_id":  ticket.ServiceID,
			"counter_id":  counterID,
			"from_status": fromStatus,
			"to_status":   "called",
			"source":      "counter_call_next",
		}
		if len(serviceIDs) > 0 {
			payload["service_ids"] = serviceIDs
		}
		h, herr := ticketaudit.NewHistory(ticket.ID, ticketaudit.ActionTicketCalled, actorUserID, payload)
		if herr != nil {
			return herr
		}
		return s.ticketRepo.CreateTicketHistoryTx(tx, h)
	})
	if err != nil {
		return nil, err
	}

	updatedCounter, err := s.repo.FindByID(counterID)
	if err != nil {
		return nil, err
	}
	if updatedCounter.AssignedTo != nil {
		user, uerr := s.userRepo.FindByID(*updatedCounter.AssignedTo)
		if uerr == nil {
			updatedCounter.AssignedUser = user
		}
	}
	s.hydrateBreakStartedAt(updatedCounter)
	s.broadcastCounterUpdated(updatedCounter)
	return ticket, nil
}
