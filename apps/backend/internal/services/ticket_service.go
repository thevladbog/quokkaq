package services

import (
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ticketaudit"
	"quokkaq-go-backend/internal/ws"

	"gorm.io/gorm"
)

// errCounterNotFoundForUser is returned from Transfer when resolving a counter by user ID fails.
var errCounterNotFoundForUser = errors.New("counter not found for user")

// ErrNoWaitingTickets is returned when call-next finds no waiting tickets in scope.
var ErrNoWaitingTickets = errors.New("no waiting tickets")

// ErrCallNextInvalidServices is returned when call-next is scoped to service IDs not all belonging to the unit.
var ErrCallNextInvalidServices = errors.New("invalid service selection: one or more services are not in this unit")

// ErrCounterUnitMismatch is returned when assigning a ticket to a counter that belongs to a different unit.
var ErrCounterUnitMismatch = errors.New("counter does not belong to the ticket's unit")

const maxOperatorCommentRunes = 2000

func diffSortedTagIDSets(fromSorted, toSorted []string) (addedIDs, removedIDs []string) {
	fromSet := make(map[string]struct{}, len(fromSorted))
	for _, id := range fromSorted {
		fromSet[id] = struct{}{}
	}
	toSet := make(map[string]struct{}, len(toSorted))
	for _, id := range toSorted {
		toSet[id] = struct{}{}
	}
	for id := range toSet {
		if _, ok := fromSet[id]; !ok {
			addedIDs = append(addedIDs, id)
		}
	}
	for id := range fromSet {
		if _, ok := toSet[id]; !ok {
			removedIDs = append(removedIDs, id)
		}
	}
	sort.Strings(addedIDs)
	sort.Strings(removedIDs)
	return addedIDs, removedIDs
}

func visitorTagLabelsForAuditTx(tx *gorm.DB, repo repository.VisitorTagDefinitionRepository, unitID string, ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	rows, err := repo.ListByIDsInUnitTx(tx, unitID, ids)
	if err != nil {
		out := append([]string(nil), ids...)
		sort.Strings(out)
		return out
	}
	byID := make(map[string]string, len(rows))
	for i := range rows {
		lab := strings.TrimSpace(rows[i].Label)
		if lab == "" {
			lab = rows[i].ID
		}
		byID[rows[i].ID] = lab
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if lab, ok := byID[id]; ok {
			out = append(out, lab)
		} else {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// ErrOperatorCommentTooLong is returned when operator comment exceeds maxOperatorCommentRunes after trim.
var ErrOperatorCommentTooLong = errors.New("operator comment exceeds maximum length")

// ErrTicketVisitorWrongStatus is returned when PATCH visitor is not allowed for the current ticket status.
var ErrTicketVisitorWrongStatus = errors.New("visitor can only be updated while ticket is called or in service")

// ErrVisitorAnonymousNotAllowed is returned when assigning the unit anonymous aggregate client to a ticket.
var ErrVisitorAnonymousNotAllowed = errors.New("cannot assign anonymous client to ticket")

// ErrVisitorMutuallyExclusive is returned when PATCH visitor sends both clientId and phone.
var ErrVisitorMutuallyExclusive = errors.New("cannot provide both clientId and phone")

// ErrVisitorPayloadInvalid is returned when PATCH visitor omits both clientId and phone (with required name context for phone path).
var ErrVisitorPayloadInvalid = errors.New("provide either clientId or phone with first and last name")

// ErrVisitorNameRequired is returned when a name-bearing path would leave the visitor without first or last name.
var ErrVisitorNameRequired = errors.New("first name or last name is required")

// ErrTicketCreateClientNotInUnit is returned when staff passes a clientId that is missing or belongs to another unit.
var ErrTicketCreateClientNotInUnit = errors.New("client not found in this unit")

// ErrDuplicateClientPhone is returned on unique phone violation when creating a unit client.
var ErrDuplicateClientPhone = errors.New("a client with this phone number already exists")

// ErrPreRegistrationPhoneInvalid wraps phone parse/normalize failures when issuing a ticket from a pre-registration.
var ErrPreRegistrationPhoneInvalid = errors.New("invalid pre-registration phone number")

// ErrCustomerNameEmpty is returned when a new unit client would be created from a pre-registration but both names are empty after trim.
var ErrCustomerNameEmpty = errors.New("pre-registration customer name is empty")

// ErrVisitorTagsCommentRequired is returned when operatorComment is empty after trim.
var ErrVisitorTagsCommentRequired = errors.New("operatorComment is required")

// ErrTicketNoVisitorForTags is returned when the ticket has no client to attach tags to.
var ErrTicketNoVisitorForTags = errors.New("ticket has no visitor assigned")

// ErrVisitorTagIDsNotInUnit is returned when one or more tag definition IDs are missing or belong to another unit.
var ErrVisitorTagIDsNotInUnit = errors.New("one or more tag definitions are invalid for this unit")

// ErrTagDefinitionIDsContainEmpty is returned when visitor-tags payload includes a blank tag id entry.
var ErrTagDefinitionIDsContainEmpty = errors.New("tagDefinitionIds must not contain empty values")

// ErrClientVisitsInvalidCursor is returned when the visits list cursor cannot be parsed.
var ErrClientVisitsInvalidCursor = errors.New("invalid visits cursor")

// PatchTicketVisitorInput is body for UpdateTicketVisitor: either ClientID (optional FirstName/LastName to patch that client) or Phone with FirstName/LastName (find/create by phone).
type PatchTicketVisitorInput struct {
	ClientID  *string
	FirstName *string
	LastName  *string
	Phone     *string
}

type TicketService interface {
	// optionalStaffClientID: when set, ticket is linked to this non-anonymous unit client; otherwise anonymous kiosk client is used.
	CreateTicket(unitID, serviceID string, optionalStaffClientID *string, actorUserID *string) (*models.Ticket, error)
	CreateTicketWithPreRegistration(unitID, serviceID, preRegID string, actorUserID *string) (*models.Ticket, error)
	GetTicketByID(id string) (*models.Ticket, error)
	GetTicketsByUnit(unitID string) ([]models.Ticket, error)
	Recall(ticketID string, actorUserID *string) (*models.Ticket, error)
	Pick(ticketID, counterID string, actorUserID *string) (*models.Ticket, error)
	Transfer(ticketID string, toCounterID, toUserID *string, actorUserID *string) (*models.Ticket, error)
	ReturnToQueue(ticketID string, actorUserID *string) (*models.Ticket, error)
	CallNext(unitID, counterID string, serviceIDs []string, actorUserID *string) (*models.Ticket, error)
	UpdateOperatorComment(ticketID string, comment *string, actorUserID *string) (*models.Ticket, error)
	UpdateStatus(ticketID, status string, actorUserID *string) (*models.Ticket, error)
	UpdateTicketVisitor(ticketID string, in PatchTicketVisitorInput, actorUserID *string) (*models.Ticket, error)
	SetVisitorTagsForTicket(ticketID string, tagDefinitionIDs []string, operatorComment string, actorUserID *string) (*models.Ticket, error)
	ListVisitsByClient(unitID, clientID string, limit int, cursor *string) ([]models.Ticket, *string, error)
}

type ticketService struct {
	repo         repository.TicketRepository
	counterRepo  repository.CounterRepository
	serviceRepo  repository.ServiceRepository
	intervalRepo repository.OperatorIntervalRepository
	clientRepo   repository.UnitClientRepository
	tagDefRepo   repository.VisitorTagDefinitionRepository
	preRegRepo   *repository.PreRegistrationRepository
	hub          *ws.Hub
	jobClient    JobEnqueuer
	log          *slog.Logger
}

func NewTicketService(
	repo repository.TicketRepository,
	counterRepo repository.CounterRepository,
	serviceRepo repository.ServiceRepository,
	intervalRepo repository.OperatorIntervalRepository,
	clientRepo repository.UnitClientRepository,
	tagDefRepo repository.VisitorTagDefinitionRepository,
	preRegRepo *repository.PreRegistrationRepository,
	hub *ws.Hub,
	jobClient JobEnqueuer,
) TicketService {
	return &ticketService{
		repo:         repo,
		counterRepo:  counterRepo,
		serviceRepo:  serviceRepo,
		intervalRepo: intervalRepo,
		clientRepo:   clientRepo,
		tagDefRepo:   tagDefRepo,
		preRegRepo:   preRegRepo,
		hub:          hub,
		jobClient:    jobClient,
		log:          slog.Default(),
	}
}

func (s *ticketService) writeTicketHistoryTx(tx *gorm.DB, ticketID string, actorUserID *string, action string, payload map[string]interface{}) error {
	h, err := ticketaudit.NewHistory(ticketID, action, actorUserID, payload)
	if err != nil {
		return err
	}
	return s.repo.CreateTicketHistoryTx(tx, h)
}

func (s *ticketService) CreateTicket(unitID, serviceID string, optionalStaffClientID *string, actorUserID *string) (*models.Ticket, error) {
	return s.createTicketInternal(unitID, serviceID, nil, optionalStaffClientID, actorUserID)
}

func (s *ticketService) CreateTicketWithPreRegistration(unitID, serviceID, preRegID string, actorUserID *string) (*models.Ticket, error) {
	return s.createTicketInternal(unitID, serviceID, &preRegID, nil, actorUserID)
}

func (s *ticketService) createTicketInternal(unitID, serviceID string, preRegID *string, optionalStaffClientID *string, actorUserID *string) (*models.Ticket, error) {
	var preReg *models.PreRegistration
	if preRegID != nil {
		if s.preRegRepo == nil {
			return nil, errors.New("pre-registration repository not configured")
		}
		pr, err := s.preRegRepo.GetByID(*preRegID)
		if err != nil {
			return nil, err
		}
		if pr.UnitID != unitID {
			return nil, errors.New("pre-registration does not belong to this unit")
		}
		preReg = pr
	}

	date := time.Now().Format("2006-01-02")
	var ticket *models.Ticket
	if err := s.repo.Transaction(func(tx *gorm.DB) error {
		seq, err := s.repo.GetNextSequenceTx(tx, unitID, serviceID, date)
		if err != nil {
			return err
		}
		service, err := s.serviceRepo.FindByIDTx(tx, serviceID)
		if err != nil {
			return err
		}

		queueNumber := fmt.Sprintf("%03d", seq)
		if service.Prefix != nil && *service.Prefix != "" {
			queueNumber = fmt.Sprintf("%s-%03d", *service.Prefix, seq)
		}

		var resolvedClientID string
		if preReg != nil {
			phoneE164, err := phoneutil.ParseAndNormalize(preReg.CustomerPhone, phoneutil.DefaultRegion())
			if err != nil {
				return fmt.Errorf("%w: %w", ErrPreRegistrationPhoneInvalid, err)
			}
			c, err := s.clientRepo.FindByUnitAndPhoneE164Tx(tx, unitID, phoneE164)
			if errors.Is(err, gorm.ErrRecordNotFound) {
				fn := strings.TrimSpace(preReg.CustomerFirstName)
				ln := strings.TrimSpace(preReg.CustomerLastName)
				if fn == "" && ln == "" {
					return ErrCustomerNameEmpty
				}
				ph := phoneE164
				c = &models.UnitClient{
					UnitID:      unitID,
					FirstName:   fn,
					LastName:    ln,
					PhoneE164:   &ph,
					IsAnonymous: false,
				}
				if err := s.clientRepo.CreateTx(tx, c); err != nil {
					if isUniqueViolation(err) {
						return ErrDuplicateClientPhone
					}
					return err
				}
			} else if err != nil {
				return err
			}
			resolvedClientID = c.ID
		} else if optionalStaffClientID != nil && strings.TrimSpace(*optionalStaffClientID) != "" {
			cid := strings.TrimSpace(*optionalStaffClientID)
			c, err := s.clientRepo.GetByIDTx(tx, cid)
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTicketCreateClientNotInUnit
			}
			if err != nil {
				return err
			}
			if c.UnitID != unitID {
				return ErrTicketCreateClientNotInUnit
			}
			if c.IsAnonymous {
				return ErrVisitorAnonymousNotAllowed
			}
			resolvedClientID = c.ID
		} else {
			anon, err := s.clientRepo.EnsureAnonymousForUnitTx(tx, unitID)
			if err != nil {
				return err
			}
			resolvedClientID = anon.ID
		}

		ticket = &models.Ticket{
			UnitID:            unitID,
			ServiceID:         serviceID,
			QueueNumber:       queueNumber,
			Status:            "waiting",
			CreatedAt:         time.Now(),
			MaxWaitingTime:    service.MaxWaitingTime,
			PreRegistrationID: preRegID,
			ClientID:          &resolvedClientID,
		}

		payload := map[string]interface{}{
			"unit_id":    unitID,
			"service_id": serviceID,
			"status":     "waiting",
			"client_id":  resolvedClientID,
		}
		if preRegID != nil {
			payload["pre_registration_id"] = *preRegID
			payload["source"] = "pre_registration_redeem"
		} else if optionalStaffClientID != nil && strings.TrimSpace(*optionalStaffClientID) != "" {
			payload["source"] = "staff_issue_named"
		} else {
			payload["source"] = "public_issue"
		}
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

func isUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (s *ticketService) GetTicketByID(id string) (*models.Ticket, error) {
	return s.repo.FindByID(id)
}

func (s *ticketService) GetTicketsByUnit(unitID string) ([]models.Ticket, error) {
	return s.repo.FindByUnitID(unitID)
}

func (s *ticketService) CallNext(unitID, counterID string, serviceIDs []string, actorUserID *string) (*models.Ticket, error) {
	if len(serviceIDs) > 0 {
		n, err := s.serviceRepo.CountByUnitAndIDs(unitID, serviceIDs)
		if err != nil {
			return nil, err
		}
		if int(n) != len(serviceIDs) {
			return nil, ErrCallNextInvalidServices
		}
	}

	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		c, err := s.counterRepo.FindByIDForUpdateTx(tx, counterID)
		if err != nil {
			return err
		}
		if c.OnBreak {
			return ErrCounterOnBreak
		}
		if c.UnitID != unitID {
			return errors.New("counter does not belong to this unit")
		}

		t, err := s.repo.FindWaitingForUpdateTx(tx, unitID, serviceIDs)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNoWaitingTickets
			}
			return err
		}
		ticket = t
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
		if len(serviceIDs) > 0 {
			payload["service_ids"] = serviceIDs
		}
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		if err := closeIdleOnCallTx(tx, s.intervalRepo, counterID, now); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketCalled, payload)
	})
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	s.enqueueTTS(ticket, counterID)

	return ticket, nil
}

func (s *ticketService) UpdateStatus(ticketID, status string, actorUserID *string) (*models.Ticket, error) {
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t
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
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		if err := s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketStatusChanged, payload); err != nil {
			return err
		}
		if ticket.CounterID != nil && ticketStatusIsActiveAtCounter(fromStatus) && !ticketStatusIsActiveAtCounter(status) {
			if err := ensureIdleIfCounterAvailableTx(tx, s.intervalRepo, s.counterRepo, s.repo, *ticket.CounterID, now); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) Recall(ticketID string, actorUserID *string) (*models.Ticket, error) {
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t
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
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketRecalled, payload)
	})
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	if ticket.CounterID != nil {
		s.enqueueTTS(ticket, *ticket.CounterID)
	}

	return ticket, nil
}

func (s *ticketService) Pick(ticketID, counterID string, actorUserID *string) (*models.Ticket, error) {
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		c, err := s.counterRepo.FindByIDForUpdateTx(tx, counterID)
		if err != nil {
			return err
		}

		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t
		if c.UnitID != ticket.UnitID {
			return ErrCounterUnitMismatch
		}
		if c.OnBreak {
			return ErrCounterOnBreak
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
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		if err := closeIdleOnCallTx(tx, s.intervalRepo, counterID, now); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketCalled, payload)
	})
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)
	s.enqueueTTS(ticket, counterID)

	return ticket, nil
}

func (s *ticketService) Transfer(ticketID string, toCounterID, toUserID *string, actorUserID *string) (*models.Ticket, error) {
	if toCounterID == nil && toUserID == nil {
		return nil, errors.New("target counter or user required")
	}

	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t

		fromStatus := ticket.Status
		var fromCounterID *string
		if ticket.CounterID != nil {
			c := *ticket.CounterID
			fromCounterID = &c
		}

		var targetCounterID string
		if toCounterID != nil {
			targetCounterID = *toCounterID
		} else {
			counter, err := s.counterRepo.FindByUserIDTx(tx, *toUserID)
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errCounterNotFoundForUser
				}
				return err
			}
			targetCounterID = counter.ID
		}

		ticket.CounterID = &targetCounterID
		ticket.Status = "waiting"

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
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		if err := s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketTransferred, payload); err != nil {
			return err
		}
		if fromCounterID != nil {
			return ensureIdleIfCounterAvailableTx(tx, s.intervalRepo, s.counterRepo, s.repo, *fromCounterID, time.Now())
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errCounterNotFoundForUser) {
			return nil, errCounterNotFoundForUser
		}
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) ReturnToQueue(ticketID string, actorUserID *string) (*models.Ticket, error) {
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t

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
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		if err := s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketReturnedToQueue, payload); err != nil {
			return err
		}
		if fromCounterID != nil {
			return ensureIdleIfCounterAvailableTx(tx, s.intervalRepo, s.counterRepo, s.repo, *fromCounterID, time.Now())
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) UpdateOperatorComment(ticketID string, comment *string, actorUserID *string) (*models.Ticket, error) {
	var stored *string
	if comment != nil {
		v := strings.TrimSpace(*comment)
		if v == "" {
			stored = nil
		} else {
			if utf8.RuneCountInString(v) > maxOperatorCommentRunes {
				return nil, ErrOperatorCommentTooLong
			}
			stored = &v
		}
	}

	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t

		var from *string
		if ticket.OperatorComment != nil {
			c := *ticket.OperatorComment
			from = &c
		}

		ticket.OperatorComment = stored

		payload := map[string]interface{}{
			"unit_id": ticket.UnitID,
		}
		if from != nil {
			payload["from_comment"] = *from
		}
		if stored != nil {
			payload["to_comment"] = *stored
		}

		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketOperatorCommentUpdated, payload)
	})
	if err != nil {
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) UpdateTicketVisitor(ticketID string, in PatchTicketVisitorInput, actorUserID *string) (*models.Ticket, error) {
	hasClient := in.ClientID != nil && strings.TrimSpace(*in.ClientID) != ""
	phoneTrim := ""
	if in.Phone != nil {
		phoneTrim = strings.TrimSpace(*in.Phone)
	}
	hasPhone := phoneTrim != ""

	if hasClient && hasPhone {
		return nil, ErrVisitorMutuallyExclusive
	}
	if !hasClient && !hasPhone {
		return nil, ErrVisitorPayloadInvalid
	}

	fn := ""
	if in.FirstName != nil {
		fn = strings.TrimSpace(*in.FirstName)
	}
	ln := ""
	if in.LastName != nil {
		ln = strings.TrimSpace(*in.LastName)
	}
	if hasPhone && fn == "" && ln == "" {
		return nil, ErrVisitorNameRequired
	}

	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t
		if ticket.Status != "called" && ticket.Status != "in_service" {
			return ErrTicketVisitorWrongStatus
		}
		var fromClientID *string
		if ticket.ClientID != nil {
			x := *ticket.ClientID
			fromClientID = &x
		}

		if hasClient {
			c, err := s.clientRepo.GetByIDTx(tx, strings.TrimSpace(*in.ClientID))
			if err != nil {
				return err
			}
			if c.UnitID != ticket.UnitID {
				return gorm.ErrRecordNotFound
			}
			if c.IsAnonymous {
				return ErrVisitorAnonymousNotAllowed
			}
			cid := c.ID
			ticket.ClientID = &cid

			if in.FirstName != nil || in.LastName != nil {
				newFirst := c.FirstName
				newLast := c.LastName
				if in.FirstName != nil {
					newFirst = fn
				}
				if in.LastName != nil {
					newLast = ln
				}
				if strings.TrimSpace(newFirst) == "" && strings.TrimSpace(newLast) == "" {
					return ErrVisitorNameRequired
				}
				if err := s.clientRepo.UpdateNamesTx(tx, c.ID, newFirst, newLast); err != nil {
					return err
				}
			}
		} else {
			e164, err := phoneutil.ParseAndNormalize(phoneTrim, phoneutil.DefaultRegion())
			if err != nil {
				return err
			}
			c, err := s.clientRepo.FindByUnitAndPhoneE164Tx(tx, ticket.UnitID, e164)
			if errors.Is(err, gorm.ErrRecordNotFound) {
				ph := e164
				c = &models.UnitClient{
					UnitID:      ticket.UnitID,
					FirstName:   fn,
					LastName:    ln,
					PhoneE164:   &ph,
					IsAnonymous: false,
				}
				if err := s.clientRepo.CreateTx(tx, c); err != nil {
					if isUniqueViolation(err) {
						return ErrDuplicateClientPhone
					}
					return err
				}
			} else if err != nil {
				return err
			}
			cid := c.ID
			ticket.ClientID = &cid
		}

		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		payload := map[string]interface{}{
			"unit_id": ticket.UnitID,
		}
		if fromClientID != nil {
			payload["from_client_id"] = *fromClientID
		}
		if ticket.ClientID != nil {
			payload["to_client_id"] = *ticket.ClientID
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketVisitorUpdated, payload)
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindByID(ticketID)
}

func (s *ticketService) SetVisitorTagsForTicket(ticketID string, tagDefinitionIDs []string, operatorComment string, actorUserID *string) (*models.Ticket, error) {
	reason := strings.TrimSpace(operatorComment)
	if reason == "" {
		return nil, ErrVisitorTagsCommentRequired
	}

	trimmed := make([]string, 0, len(tagDefinitionIDs))
	for _, id := range tagDefinitionIDs {
		t := strings.TrimSpace(id)
		if t == "" {
			return nil, ErrTagDefinitionIDsContainEmpty
		}
		trimmed = append(trimmed, t)
	}
	seen := make(map[string]struct{}, len(trimmed))
	unique := make([]string, 0, len(trimmed))
	for _, id := range trimmed {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	sort.Strings(unique)

	err := s.repo.Transaction(func(tx *gorm.DB) error {
		ticket, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		if ticket.Status != "called" && ticket.Status != "in_service" {
			return ErrTicketVisitorWrongStatus
		}
		if ticket.ClientID == nil || strings.TrimSpace(*ticket.ClientID) == "" {
			return ErrTicketNoVisitorForTags
		}
		client, err := s.clientRepo.GetByIDTx(tx, strings.TrimSpace(*ticket.ClientID))
		if err != nil {
			return err
		}
		if client.IsAnonymous {
			return ErrVisitorAnonymousNotAllowed
		}
		if len(unique) > 0 {
			n, err := s.tagDefRepo.CountInUnitWithIDs(ticket.UnitID, unique)
			if err != nil {
				return err
			}
			if n != int64(len(unique)) {
				return ErrVisitorTagIDsNotInUnit
			}
		}
		fromIDs, err := s.clientRepo.ListTagDefinitionIDsByClientTx(tx, client.ID)
		if err != nil {
			return err
		}
		sort.Strings(fromIDs)
		if err := s.clientRepo.ReplaceClientTagAssignmentsTx(tx, client.UnitID, client.ID, unique); err != nil {
			return err
		}

		line := fmt.Sprintf("[%s] [visitor-tags] %s", time.Now().UTC().Format(time.RFC3339), reason)
		var newComment string
		if ticket.OperatorComment != nil && strings.TrimSpace(*ticket.OperatorComment) != "" {
			base := strings.TrimRight(strings.TrimSpace(*ticket.OperatorComment), "\n")
			newComment = base + "\n" + line
		} else {
			newComment = line
		}
		if utf8.RuneCountInString(newComment) > maxOperatorCommentRunes {
			return ErrOperatorCommentTooLong
		}
		ticket.OperatorComment = &newComment
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}

		fromCopy := append([]string(nil), fromIDs...)
		toCopy := append([]string(nil), unique...)
		addedIDs, removedIDs := diffSortedTagIDSets(fromCopy, toCopy)
		addedLabels := visitorTagLabelsForAuditTx(tx, s.tagDefRepo, ticket.UnitID, addedIDs)
		removedLabels := visitorTagLabelsForAuditTx(tx, s.tagDefRepo, ticket.UnitID, removedIDs)
		payload := map[string]interface{}{
			"unit_id":            ticket.UnitID,
			"client_id":          client.ID,
			"from_tag_ids":       fromCopy,
			"to_tag_ids":         toCopy,
			"added_tag_ids":      addedIDs,
			"removed_tag_ids":    removedIDs,
			"added_tag_labels":   addedLabels,
			"removed_tag_labels": removedLabels,
			"reason":             reason,
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketVisitorTagsUpdated, payload)
	})
	if err != nil {
		return nil, err
	}

	ticket, err := s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}
	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

func (s *ticketService) ListVisitsByClient(unitID, clientID string, limit int, cursor *string) ([]models.Ticket, *string, error) {
	c, err := s.clientRepo.GetByID(clientID)
	if err != nil {
		return nil, nil, err
	}
	if c.UnitID != unitID {
		return nil, nil, gorm.ErrRecordNotFound
	}
	if c.IsAnonymous {
		return []models.Ticket{}, nil, nil
	}
	var beforeTime *time.Time
	var beforeID *string
	if cursor != nil {
		raw := strings.TrimSpace(*cursor)
		if raw != "" {
			parts := strings.SplitN(raw, "|", 2)
			if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
				return nil, nil, fmt.Errorf("%w", ErrClientVisitsInvalidCursor)
			}
			t, err := time.Parse(time.RFC3339Nano, parts[0])
			if err != nil {
				return nil, nil, errors.Join(ErrClientVisitsInvalidCursor, err)
			}
			beforeTime = &t
			beforeID = &parts[1]
		}
	}
	items, err := s.repo.ListVisitsByClientID(unitID, clientID, limit, beforeTime, beforeID)
	if err != nil {
		return nil, nil, err
	}
	var next *string
	if len(items) > 0 && len(items) == limit {
		last := items[len(items)-1]
		s := fmt.Sprintf("%s|%s", last.CreatedAt.Format(time.RFC3339Nano), last.ID)
		next = &s
	}
	return items, next, nil
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
