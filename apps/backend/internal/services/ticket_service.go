package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"quokkaq-go-backend/internal/localeutil"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/phoneutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ticketaudit"
	"quokkaq-go-backend/internal/ws"

	"gorm.io/gorm"
)

// ErrCounterNotFoundForUser is returned from Transfer when resolving a counter by user ID fails.
var ErrCounterNotFoundForUser = errors.New("counter not found for user")

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

// ErrVisitorPhoneInvalid wraps phone parse/normalize failures when PATCHing ticket visitor by phone.
var ErrVisitorPhoneInvalid = errors.New("invalid visitor phone number")

// ErrPreRegistrationServiceMismatch is returned when a pre-registration's service does not match the requested service.
var ErrPreRegistrationServiceMismatch = errors.New("pre-registration does not match the requested service")

// ErrTicketServiceNotInUnit is returned when the target service belongs to a different unit than the ticket request.
var ErrTicketServiceNotInUnit = errors.New("service does not belong to this unit")

// ErrCustomerNameEmpty is returned when a new unit client would be created from a pre-registration but both names are empty after trim.
var ErrCustomerNameEmpty = errors.New("pre-registration customer name is empty")

// ErrTicketCreateVisitorConflict is returned when both clientId and visitorPhone are set on ticket creation.
var ErrTicketCreateVisitorConflict = errors.New("cannot provide both clientId and visitor phone")

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

// ErrTicketNotCancellable is returned when visitor tries to cancel a ticket that is not in waiting status.
var ErrTicketNotCancellable = errors.New("ticket cannot be cancelled: only waiting tickets can be cancelled by visitor")

// ErrTicketNotWaiting is returned when an operation requires the ticket to be in waiting status.
var ErrTicketNotWaiting = errors.New("ticket is not in waiting status")

// ErrTransferConflictingTargets is returned when both counter/user and zone targets are set.
var ErrTransferConflictingTargets = errors.New("cannot combine counter transfer with zone transfer")

// ErrTransferConflictingCounterAndUser is returned when both toCounterId and toUserId are set.
var ErrTransferConflictingCounterAndUser = errors.New("cannot specify both toCounterId and toUserId")

// ErrTransferTargetRequired is returned when no transfer target (counter, user, or zone) is provided.
var ErrTransferTargetRequired = errors.New("target counter, user, or service zone required")

// ErrTransferServiceRequiredForZone is returned when the current service is not allowed in the target zone and toServiceId is missing.
var ErrTransferServiceRequiredForZone = errors.New("toServiceId is required: current service is not available in the target zone")

// ErrTransferTargetMustBeLeafService is returned from counter transfer when toServiceId is not a leaf.
var ErrTransferTargetMustBeLeafService = errors.New("target service must be a leaf service")

// ErrTransferTargetServiceNotInZone is returned from zone transfer when the resolved service is not allowed in the target zone.
var ErrTransferTargetServiceNotInZone = errors.New("target service is not available in the selected zone")

// ErrTransferServiceNotAllowedOnTargetCounter is returned when toServiceId is not allowed on the target counter's waiting pool.
var ErrTransferServiceNotAllowedOnTargetCounter = errors.New("target service is not available for the target counter's service zone")

// ErrTicketCounterZoneMismatch is returned when pick/call would pair a counter with a ticket from another waiting pool.
var ErrTicketCounterZoneMismatch = errors.New("ticket and counter belong to different waiting pools")

// PatchTicketVisitorInput is body for UpdateTicketVisitor: either ClientID (optional FirstName/LastName to patch that client) or Phone with FirstName/LastName (find/create by phone).
type PatchTicketVisitorInput struct {
	ClientID  *string
	FirstName *string
	LastName  *string
	Phone     *string
}

// TransferTicketInput is the body for POST /tickets/{id}/transfer (counter/user path XOR zone path).
type TransferTicketInput struct {
	ToCounterID     *string
	ToUserID        *string
	ToServiceZoneID *string
	ToServiceID     *string
	// OperatorCommentUpdate: true when JSON included operatorComment (including explicit null to clear).
	OperatorCommentUpdate bool
	OperatorComment       *string
}

type TicketService interface {
	// optionalStaffClientID: when set, ticket is linked to this non-anonymous unit client; otherwise anonymous kiosk client is used.
	// visitorPhone + visitorLocale: optional kiosk identification; locale must be en or ru when phone is set; mutually exclusive with optionalStaffClientID.
	CreateTicket(unitID, serviceID string, optionalStaffClientID *string, visitorPhone *string, visitorLocale *string, actorUserID *string) (*models.Ticket, error)
	CreateTicketWithPreRegistration(unitID, serviceID, preRegID string, actorUserID *string) (*models.Ticket, error)
	GetTicketByID(id string) (*models.Ticket, error)
	GetTicketsByUnit(unitID string) ([]models.Ticket, error)
	Recall(ticketID string, actorUserID *string) (*models.Ticket, error)
	Pick(ticketID, counterID string, actorUserID *string) (*models.Ticket, error)
	Transfer(ticketID string, in TransferTicketInput, actorUserID *string) (*models.Ticket, error)
	ReturnToQueue(ticketID string, actorUserID *string) (*models.Ticket, error)
	CallNext(unitID, counterID string, serviceIDs []string, actorUserID *string) (*models.Ticket, error)
	UpdateOperatorComment(ticketID string, comment *string, actorUserID *string) (*models.Ticket, error)
	UpdateStatus(ticketID, status string, actorUserID *string) (*models.Ticket, error)
	UpdateTicketVisitor(ticketID string, in PatchTicketVisitorInput, actorUserID *string) (*models.Ticket, error)
	SetVisitorTagsForTicket(ticketID string, tagDefinitionIDs []string, operatorComment string, actorUserID *string) (*models.Ticket, error)
	ListVisitsByClient(unitID, clientID string, limit int, cursor *string) ([]models.Ticket, *string, error)
	// VisitorCancelTicket cancels a waiting ticket on behalf of the visitor (no auth required beyond knowing the ticket ID).
	VisitorCancelTicket(ticketID string) (*models.Ticket, error)
	// AttachPhoneToTicket links a phone number (E.164) to the UnitClient of a waiting ticket for SMS opt-in.
	AttachPhoneToTicket(ticketID, phoneE164, locale string) (*models.Ticket, error)
	// SetNotificationService injects the SMS notification service after construction.
	SetNotificationService(ns *NotificationService)
}

type ticketService struct {
	repo               repository.TicketRepository
	counterRepo        repository.CounterRepository
	serviceRepo        repository.ServiceRepository
	unitRepo           repository.UnitRepository
	intervalRepo       repository.OperatorIntervalRepository
	clientRepo         repository.UnitClientRepository
	tagDefRepo         repository.VisitorTagDefinitionRepository
	unitClientHistRepo repository.UnitClientHistoryRepository
	preRegRepo         *repository.PreRegistrationRepository
	operatorSkillRepo  repository.OperatorSkillRepository
	calendar           *CalendarIntegrationService
	hub                *ws.Hub
	jobClient          JobEnqueuer
	log                *slog.Logger
	quota              QuotaService
	operational        *OperationalService
	notifService       *NotificationService
}

// SetNotificationService wires in the SMS notification service after construction
// (avoids a circular initialisation dependency).
func (s *ticketService) SetNotificationService(ns *NotificationService) {
	s.notifService = ns
}

func NewTicketService(
	repo repository.TicketRepository,
	counterRepo repository.CounterRepository,
	serviceRepo repository.ServiceRepository,
	unitRepo repository.UnitRepository,
	intervalRepo repository.OperatorIntervalRepository,
	clientRepo repository.UnitClientRepository,
	tagDefRepo repository.VisitorTagDefinitionRepository,
	unitClientHistRepo repository.UnitClientHistoryRepository,
	preRegRepo *repository.PreRegistrationRepository,
	operatorSkillRepo repository.OperatorSkillRepository,
	calendar *CalendarIntegrationService,
	hub *ws.Hub,
	jobClient JobEnqueuer,
) TicketService {
	return &ticketService{
		repo:               repo,
		counterRepo:        counterRepo,
		serviceRepo:        serviceRepo,
		unitRepo:           unitRepo,
		intervalRepo:       intervalRepo,
		clientRepo:         clientRepo,
		tagDefRepo:         tagDefRepo,
		unitClientHistRepo: unitClientHistRepo,
		preRegRepo:         preRegRepo,
		operatorSkillRepo:  operatorSkillRepo,
		calendar:           calendar,
		hub:                hub,
		jobClient:          jobClient,
		log:                slog.Default(),
	}
}

// NewTicketServiceWithQuota creates a TicketService with quota enforcement and credit mechanism.
func NewTicketServiceWithQuota(
	repo repository.TicketRepository,
	counterRepo repository.CounterRepository,
	serviceRepo repository.ServiceRepository,
	unitRepo repository.UnitRepository,
	intervalRepo repository.OperatorIntervalRepository,
	clientRepo repository.UnitClientRepository,
	tagDefRepo repository.VisitorTagDefinitionRepository,
	unitClientHistRepo repository.UnitClientHistoryRepository,
	preRegRepo *repository.PreRegistrationRepository,
	operatorSkillRepo repository.OperatorSkillRepository,
	calendar *CalendarIntegrationService,
	hub *ws.Hub,
	jobClient JobEnqueuer,
	quota QuotaService,
	operational *OperationalService,
) TicketService {
	return &ticketService{
		repo:               repo,
		counterRepo:        counterRepo,
		serviceRepo:        serviceRepo,
		unitRepo:           unitRepo,
		intervalRepo:       intervalRepo,
		clientRepo:         clientRepo,
		tagDefRepo:         tagDefRepo,
		unitClientHistRepo: unitClientHistRepo,
		preRegRepo:         preRegRepo,
		operatorSkillRepo:  operatorSkillRepo,
		calendar:           calendar,
		hub:                hub,
		jobClient:          jobClient,
		log:                slog.Default(),
		quota:              quota,
		operational:        operational,
	}
}

func (s *ticketService) writeTicketHistoryTx(tx *gorm.DB, ticketID string, actorUserID *string, action string, payload map[string]interface{}) error {
	h, err := ticketaudit.NewHistory(ticketID, action, actorUserID, payload)
	if err != nil {
		return err
	}
	return s.repo.CreateTicketHistoryTx(tx, h)
}

// ErrTicketQuotaExhausted is returned when the monthly ticket quota is exhausted
// and the working day has already been closed (EOD completed), so credit issuance is not allowed.
var ErrTicketQuotaExhausted = errors.New("monthly ticket quota exhausted; close the working day to stop credit issuance")

// isWorkingDayOpen returns true when the subdivision has NOT completed EOD today,
// meaning the kiosk is not frozen and the phase is still idle.
func (s *ticketService) isWorkingDayOpen(unitID string) (bool, error) {
	if s.operational == nil {
		return true, nil // no operational service wired — treat as open
	}
	subID, err := s.operational.ResolveSubdivisionForOperationalState(unitID)
	if err != nil {
		return true, nil // resolution failure — allow creation, don't block
	}
	frozen, err := s.operational.IsKioskFrozen(subID)
	if err != nil {
		return true, nil
	}
	return !frozen, nil
}

func (s *ticketService) checkTicketQuota(unitID string) (isCredit bool, err error) {
	if s.quota == nil {
		return false, nil
	}
	// Resolve companyID from unit.
	unit, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return false, err
	}
	companyID := unit.CompanyID

	allowed, err := s.quota.CheckQuota(companyID, "tickets_per_month")
	if err != nil {
		return false, err
	}
	if allowed {
		return false, nil
	}
	// Quota exhausted — check if working day is still open (credit issuance).
	open, err := s.isWorkingDayOpen(unitID)
	if err != nil {
		return false, err
	}
	if open {
		// Working day is open: issue ticket on credit.
		return true, nil
	}
	return false, ErrTicketQuotaExhausted
}

func (s *ticketService) incrementTicketUsage(unitID string) {
	if s.quota == nil {
		return
	}
	unit, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		s.log.Warn("incrementTicketUsage: could not resolve unit", "unitID", unitID, "err", err)
		return
	}
	if err := s.quota.IncrementUsage(unit.CompanyID, "tickets_per_month", 1); err != nil {
		s.log.Warn("incrementTicketUsage: increment failed", "companyID", unit.CompanyID, "err", err)
	}
}

func (s *ticketService) CreateTicket(unitID, serviceID string, optionalStaffClientID *string, visitorPhone *string, visitorLocale *string, actorUserID *string) (*models.Ticket, error) {
	isCredit, err := s.checkTicketQuota(unitID)
	if err != nil {
		return nil, err
	}
	ticket, err := s.createTicketInternal(unitID, serviceID, nil, optionalStaffClientID, visitorPhone, visitorLocale, actorUserID, isCredit)
	if err != nil {
		return nil, err
	}
	go s.incrementTicketUsage(unitID)
	return ticket, nil
}

func (s *ticketService) CreateTicketWithPreRegistration(unitID, serviceID, preRegID string, actorUserID *string) (*models.Ticket, error) {
	isCredit, err := s.checkTicketQuota(unitID)
	if err != nil {
		return nil, err
	}
	ticket, err := s.createTicketInternal(unitID, serviceID, &preRegID, nil, nil, nil, actorUserID, isCredit)
	if err != nil {
		return nil, err
	}
	go s.incrementTicketUsage(unitID)
	return ticket, nil
}

func (s *ticketService) createTicketInternal(unitID, serviceID string, preRegID *string, optionalStaffClientID *string, visitorPhone *string, visitorLocale *string, actorUserID *string, isCredit bool) (*models.Ticket, error) {
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
		if pr.ServiceID != serviceID {
			return nil, ErrPreRegistrationServiceMismatch
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
		if service.UnitID != unitID {
			return ErrTicketServiceNotInUnit
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
		} else if kioskPhone := strings.TrimSpace(derefString(visitorPhone)); kioskPhone != "" {
			if optionalStaffClientID != nil && strings.TrimSpace(*optionalStaffClientID) != "" {
				return ErrTicketCreateVisitorConflict
			}
			fn, ln, lerr := localeutil.UnknownVisitorPlaceholderNames(derefString(visitorLocale))
			if lerr != nil {
				return lerr
			}
			phoneE164, err := phoneutil.ParseAndNormalize(kioskPhone, phoneutil.DefaultRegion())
			if err != nil {
				return fmt.Errorf("%w: %w", ErrVisitorPhoneInvalid, err)
			}
			c, err := s.clientRepo.FindByUnitAndPhoneE164Tx(tx, unitID, phoneE164)
			if errors.Is(err, gorm.ErrRecordNotFound) {
				ph := phoneE164
				loc := derefString(visitorLocale)
				c = &models.UnitClient{
					UnitID:      unitID,
					FirstName:   fn,
					LastName:    ln,
					PhoneE164:   &ph,
					Locale:      &loc,
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
			ServiceZoneID:     service.RestrictedServiceZoneID,
			ServiceID:         serviceID,
			QueueNumber:       queueNumber,
			Status:            "waiting",
			CreatedAt:         time.Now(),
			MaxWaitingTime:    service.MaxWaitingTime,
			PreRegistrationID: preRegID,
			ClientID:          &resolvedClientID,
			IsCredit:          isCredit,
			VisitorToken:      uuid.New().String(),
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
		} else if strings.TrimSpace(derefString(visitorPhone)) != "" {
			payload["source"] = "public_issue_kiosk_phone"
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

	if s.calendar != nil && preReg != nil && preReg.ExternalEventHref != nil && *preReg.ExternalEventHref != "" {
		integ, err := s.calendar.ResolveIntegrationForRelease(preReg)
		if err != nil {
			s.log.Warn("calendar resolve integration for ticket format",
				"err", err,
				"preRegistrationId", preReg.ID,
				"externalEventHref", *preReg.ExternalEventHref,
			)
		} else if integ != nil && integ.Enabled {
			svc, err := s.serviceRepo.FindByID(serviceID)
			if err == nil {
				calCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := s.calendar.ApplyTicketFormat(calCtx, integ, svc, preReg, ticket); err != nil {
					s.log.Warn("calendar ticket format", "err", err)
				}
			}
		}
	}

	s.hub.BroadcastEvent("ticket.created", ticket, ticket.UnitID)
	return ticket, nil
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func isUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (s *ticketService) GetTicketByID(id string) (*models.Ticket, error) {
	return s.repo.FindByID(id)
}

// resolveSubdivisionIDForServiceZoneUnit walks parent units until a subdivision (nested service zones).
func (s *ticketService) resolveSubdivisionIDForServiceZoneUnit(zone *models.Unit) (subdivisionID string, ok bool, err error) {
	if zone == nil || zone.Kind != models.UnitKindServiceZone {
		return "", false, nil
	}
	cur := zone
	visited := map[string]struct{}{zone.ID: {}}
	for {
		if cur.ParentID == nil || strings.TrimSpace(*cur.ParentID) == "" {
			return "", false, nil
		}
		pid := strings.TrimSpace(*cur.ParentID)
		parent, perr := s.unitRepo.FindByID(pid)
		if perr != nil {
			return "", false, perr
		}
		if parent.Kind == models.UnitKindSubdivision {
			return parent.ID, true, nil
		}
		if parent.Kind != models.UnitKindServiceZone {
			return "", false, nil
		}
		if _, seen := visited[parent.ID]; seen {
			return "", false, nil
		}
		visited[parent.ID] = struct{}{}
		cur = parent
	}
}

func (s *ticketService) GetTicketsByUnit(unitID string) ([]models.Ticket, error) {
	u, err := s.unitRepo.FindByID(unitID)
	if err != nil {
		return nil, err
	}
	if u.Kind == models.UnitKindServiceZone {
		subID, ok, rerr := s.resolveSubdivisionIDForServiceZoneUnit(u)
		if rerr != nil {
			return nil, rerr
		}
		if !ok {
			return []models.Ticket{}, nil
		}
		return s.repo.FindBySubdivisionAndServiceZoneID(subID, u.ID)
	}
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
	var skillRoutingMiss bool
	var missUserID string
	var missSkillIDs []string
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		c, err := s.counterRepo.FindByIDForUpdateTx(tx, counterID)
		if err != nil {
			return err
		}
		if c.OnBreak {
			return ErrCounterOnBreak
		}
		if c.UnitID != unitID {
			return ErrCounterUnitMismatch
		}

		t, missed, userID, skillIDs, err := s.findNextTicketTx(tx, unitID, serviceIDs, c)
		if err != nil {
			return err
		}
		ticket = t
		skillRoutingMiss = missed
		missUserID = userID
		missSkillIDs = skillIDs
		fromStatus := ticket.Status
		now := time.Now()
		ticket.Status = "called"
		ticket.CounterID = &counterID
		ticket.CalledAt = &now
		if c.AssignedTo != nil {
			ticket.ServedByUserID = c.AssignedTo
		}

		payload := map[string]interface{}{
			"unit_id":     ticket.UnitID,
			"service_id":  ticket.ServiceID,
			"counter_id":  counterID,
			"from_status": fromStatus,
			"to_status":   "called",
			"source":      "unit_call_next",
		}
		if c.ServiceZoneID != nil {
			payload["counter_service_zone_id"] = *c.ServiceZoneID
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

	if c, err := s.counterRepo.FindByID(counterID); err == nil {
		ticket.Counter = c
	}
	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)
	if skillRoutingMiss && s.hub != nil {
		s.hub.BroadcastEvent("unit.skill_routing_miss", map[string]interface{}{
			"unitId":          unitID,
			"userId":          missUserID,
			"skillServiceIds": missSkillIDs,
			"counterId":       counterID,
		}, unitID)
	}

	s.enqueueTTS(ticket, counterID)

	// Fire-and-forget SMS notification to visitor.
	if s.notifService != nil {
		go s.notifService.SendTicketCalledSMS(ticket)
	}

	// Notify the new first-in-queue visitor that they're next (queue position = 1).
	if s.notifService != nil {
		go s.notifyNextInLine(ticket.UnitID, serviceIDs, ticket.ServiceZoneID)
	}

	return ticket, nil
}

// findNextTicketTx selects the next ticket to call within a transaction.
// When skill-based routing is enabled for the unit and the counter has an assigned operator with skills,
// it attempts to find the best skill-matched ticket first; falls back to standard FIFO on no match.
// Returns: ticket, skillRoutingMiss (true when skill search was attempted but fell back to FIFO),
// missUserID, missSkillIDs (for the skill_routing_miss WS event).
func (s *ticketService) findNextTicketTx(tx *gorm.DB, unitID string, serviceIDs []string, c *models.Counter) (*models.Ticket, bool, string, []string, error) {
	if s.operatorSkillRepo != nil && c.AssignedTo != nil {
		unit, err := s.unitRepo.FindByIDLight(unitID)
		if err == nil && unit.SkillBasedRoutingEnabled {
			skillIDs, serr := s.operatorSkillRepo.ListSkillServiceIDsForOperator(unitID, *c.AssignedTo)
			if serr == nil && len(skillIDs) > 0 {
				// Intersect with caller-supplied serviceIDs filter when non-empty.
				filtered := filterSkillIDsByServiceFilter(skillIDs, serviceIDs)
				if len(filtered) > 0 {
					t, err := s.repo.FindWaitingWithSkillsTx(tx, unitID, filtered, c.ServiceZoneID)
					if err == nil {
						return t, false, "", nil, nil
					}
					if !errors.Is(err, gorm.ErrRecordNotFound) {
						return nil, false, "", nil, err
					}
					// No skill-matched ticket — fall through to FIFO and signal miss.
					t, ferr := s.repo.FindWaitingForUpdateTx(tx, unitID, serviceIDs, c.ServiceZoneID)
					if ferr != nil {
						if errors.Is(ferr, gorm.ErrRecordNotFound) {
							return nil, false, "", nil, ErrNoWaitingTickets
						}
						return nil, false, "", nil, ferr
					}
					return t, true, *c.AssignedTo, filtered, nil
				}
			}
		}
	}
	t, err := s.repo.FindWaitingForUpdateTx(tx, unitID, serviceIDs, c.ServiceZoneID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, "", nil, ErrNoWaitingTickets
		}
		return nil, false, "", nil, err
	}
	return t, false, "", nil, nil
}

// filterSkillIDsByServiceFilter intersects skill service IDs with an explicit filter list.
// When filter is empty all skill IDs are returned (no restriction).
func filterSkillIDsByServiceFilter(skillIDs, filterIDs []string) []string {
	if len(filterIDs) == 0 {
		return skillIDs
	}
	set := make(map[string]struct{}, len(filterIDs))
	for _, id := range filterIDs {
		set[id] = struct{}{}
	}
	out := make([]string, 0, len(skillIDs))
	for _, id := range skillIDs {
		if _, ok := set[id]; ok {
			out = append(out, id)
		}
	}
	return out
}

// notifyNextInLine finds the current first-waiting ticket and sends a "you're next" SMS
// if they have a phone. Called after a ticket is called (position of remaining tickets shifts).
// zoneID scopes the lookup to the same service zone as the called ticket.
func (s *ticketService) notifyNextInLine(unitID string, serviceIDs []string, zoneID *string) {
	next, err := s.repo.FindWaiting(unitID, serviceIDs, zoneID)
	if err != nil || next == nil {
		return
	}
	// Only alert if they are genuinely first (position 1).
	pos, err := s.repo.GetQueuePosition(next)
	if err != nil || pos != 1 {
		return
	}
	s.notifService.SendQueuePositionAlert(next)
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
			// Snapshot the service-time SLA from the current leaf service.
			ticket.MaxServiceTime = nil
			svc, svcErr := s.serviceRepo.FindByIDTx(tx, ticket.ServiceID)
			if svcErr != nil {
				return svcErr
			}
			if svc.MaxServiceTime != nil && *svc.MaxServiceTime > 0 {
				maxServiceTime := *svc.MaxServiceTime
				ticket.MaxServiceTime = &maxServiceTime
			}
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

func (s *ticketService) VisitorCancelTicket(ticketID string) (*models.Ticket, error) {
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t
		if ticket.Status != "waiting" {
			return ErrTicketNotCancellable
		}
		now := time.Now()
		ticket.Status = "no_show"
		ticket.CompletedAt = &now
		payload := map[string]interface{}{
			"unit_id":     ticket.UnitID,
			"from_status": "waiting",
			"to_status":   "no_show",
			"reason":      "visitor_cancel",
		}
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		return s.writeTicketHistoryTx(tx, ticket.ID, nil, ticketaudit.ActionTicketVisitorCancelled, payload)
	})
	if err != nil {
		return nil, err
	}
	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

// AttachPhoneToTicket links an E.164 phone number to the UnitClient of a waiting ticket.
// If the ticket's client already has a phone, it is updated. If the ticket uses the anonymous client,
// a new named client is created and linked to the ticket.
func (s *ticketService) AttachPhoneToTicket(ticketID, phoneE164, locale string) (*models.Ticket, error) {
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t

		if t.Status != "waiting" {
			return ErrTicketNotWaiting
		}

		// Resolve or create a client with the provided phone.
		c, lookupErr := s.clientRepo.FindByUnitAndPhoneE164Tx(tx, t.UnitID, phoneE164)
		if lookupErr != nil && !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			return lookupErr
		}

		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			// Create a new client for this phone if none exists.
			fn, ln, nameErr := localeutil.UnknownVisitorPlaceholderNames(locale)
			if nameErr != nil {
				fn, ln = "Неизвестно", "Неизвестно"
			}
			ph := phoneE164
			c = &models.UnitClient{
				UnitID:      t.UnitID,
				FirstName:   fn,
				LastName:    ln,
				PhoneE164:   &ph,
				Locale:      &locale,
				IsAnonymous: false,
			}
			if cErr := s.clientRepo.CreateTx(tx, c); cErr != nil {
				return cErr
			}
		}

		// Link the client to the ticket.
		ticket.ClientID = &c.ID
		if err := s.repo.UpdateTx(tx, ticket); err != nil {
			return err
		}
		// Audit log: record phone attachment with a hashed phone number (no PII in history).
		h := sha256.Sum256([]byte(phoneE164))
		return s.writeTicketHistoryTx(tx, ticket.ID, nil, ticketaudit.ActionTicketPhoneAttached, map[string]interface{}{
			"phone_sha256": hex.EncodeToString(h[:]),
		})
	})
	if err != nil {
		return nil, err
	}
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

	if ticket.CounterID != nil {
		if c, err := s.counterRepo.FindByID(*ticket.CounterID); err == nil {
			ticket.Counter = c
		}
	}
	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)

	if ticket.CounterID != nil {
		s.enqueueTTS(ticket, *ticket.CounterID)
	}

	// Fire-and-forget SMS notification to visitor (parity with CallNext / Pick).
	if s.notifService != nil {
		go s.notifService.SendTicketCalledSMS(ticket)
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
		if !CounterPoolMatchesTicket(c.ServiceZoneID, t.ServiceZoneID) {
			return ErrTicketCounterZoneMismatch
		}
		fromStatus := ticket.Status
		now := time.Now()
		ticket.Status = "called"
		ticket.CounterID = &counterID
		ticket.CalledAt = &now
		if c.AssignedTo != nil {
			ticket.ServedByUserID = c.AssignedTo
		}

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

	if c, err := s.counterRepo.FindByID(counterID); err == nil {
		ticket.Counter = c
	}
	s.hub.BroadcastEvent("ticket.called", ticket, ticket.UnitID)
	s.enqueueTTS(ticket, counterID)

	// Fire-and-forget SMS notification to visitor (parity with CallNext).
	if s.notifService != nil {
		go s.notifService.SendTicketCalledSMS(ticket)
		// Notify the new first-in-queue visitor (parity with CallNext).
		go s.notifyNextInLine(ticket.UnitID, nil, ticket.ServiceZoneID)
	}

	return ticket, nil
}

func (s *ticketService) Transfer(ticketID string, in TransferTicketInput, actorUserID *string) (*models.Ticket, error) {
	zoneIDTrim := ""
	if in.ToServiceZoneID != nil {
		zoneIDTrim = strings.TrimSpace(*in.ToServiceZoneID)
	}
	zoneTransfer := zoneIDTrim != ""
	counterTransfer := (in.ToCounterID != nil && strings.TrimSpace(*in.ToCounterID) != "") || (in.ToUserID != nil && strings.TrimSpace(*in.ToUserID) != "")

	if zoneTransfer && counterTransfer {
		return nil, ErrTransferConflictingTargets
	}
	if !zoneTransfer && !counterTransfer {
		return nil, ErrTransferTargetRequired
	}
	hasCounterID := in.ToCounterID != nil && strings.TrimSpace(*in.ToCounterID) != ""
	hasUserID := in.ToUserID != nil && strings.TrimSpace(*in.ToUserID) != ""
	if hasCounterID && hasUserID {
		return nil, ErrTransferConflictingCounterAndUser
	}

	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t

		if in.OperatorCommentUpdate {
			if err := s.patchOperatorCommentOnLockedTicketTx(tx, ticket, in.OperatorComment, actorUserID); err != nil {
				return err
			}
		}

		fromStatus := ticket.Status
		var fromCounterID *string
		if ticket.CounterID != nil {
			c := *ticket.CounterID
			fromCounterID = &c
		}

		fromServiceID := ticket.ServiceID
		fromZoneID := ticket.ServiceZoneID

		if zoneTransfer {
			if err := ValidateChildServiceZone(s.unitRepo, ticket.UnitID, zoneIDTrim); err != nil {
				return err
			}
			curSvc, err := s.serviceRepo.FindByIDTx(tx, ticket.ServiceID)
			if err != nil {
				return err
			}
			needNewService := !ServiceAllowedInZone(curSvc, zoneIDTrim)
			var resolvedServiceID string
			if in.ToServiceID != nil && strings.TrimSpace(*in.ToServiceID) != "" {
				resolvedServiceID = strings.TrimSpace(*in.ToServiceID)
			} else if needNewService {
				return ErrTransferServiceRequiredForZone
			} else {
				resolvedServiceID = ticket.ServiceID
			}
			newSvc, err := s.serviceRepo.FindByIDTx(tx, resolvedServiceID)
			if err != nil {
				return err
			}
			if newSvc.UnitID != ticket.UnitID {
				return ErrTicketServiceNotInUnit
			}
			if !newSvc.IsLeaf {
				return ErrTransferTargetMustBeLeafService
			}
			if !ServiceAllowedInZone(newSvc, zoneIDTrim) {
				return ErrTransferTargetServiceNotInZone
			}

			zCopy := zoneIDTrim
			ticket.ServiceZoneID = &zCopy
			ticket.ServiceID = resolvedServiceID
			ticket.Status = "waiting"
			ticket.CounterID = nil
			ticket.CalledAt = nil
			ticket.ConfirmedAt = nil
			ticket.MaxWaitingTime = newSvc.MaxWaitingTime
			ticket.MaxServiceTime = nil
			// Clear served_by so statistics don't attribute the waiting period to the previous operator.
			ticket.ServedByUserID = nil

			payload := map[string]interface{}{
				"transfer_kind":        "zone",
				"unit_id":              ticket.UnitID,
				"from_status":          fromStatus,
				"to_status":            "waiting",
				"from_service_id":      fromServiceID,
				"to_service_id":        resolvedServiceID,
				"from_service_label":   curSvc.Name,
				"to_service_label":     newSvc.Name,
				"queue_number":         ticket.QueueNumber,
				"from_service_zone_id": serviceZoneIDJSON(fromZoneID),
				"to_service_zone_id":   zoneIDTrim,
			}
			if curSvc.NameRu != nil && strings.TrimSpace(*curSvc.NameRu) != "" {
				payload["from_service_name_ru"] = strings.TrimSpace(*curSvc.NameRu)
			}
			if curSvc.NameEn != nil && strings.TrimSpace(*curSvc.NameEn) != "" {
				payload["from_service_name_en"] = strings.TrimSpace(*curSvc.NameEn)
			}
			if newSvc.NameRu != nil && strings.TrimSpace(*newSvc.NameRu) != "" {
				payload["to_service_name_ru"] = strings.TrimSpace(*newSvc.NameRu)
			}
			if newSvc.NameEn != nil && strings.TrimSpace(*newSvc.NameEn) != "" {
				payload["to_service_name_en"] = strings.TrimSpace(*newSvc.NameEn)
			}
			if fromCounterID != nil {
				payload["from_counter_id"] = *fromCounterID
			}
			if n, ok := s.resolveFromZoneNameForTransferPayload(fromZoneID, ticket.UnitID); ok {
				payload["from_zone_name"] = n
			}
			if zu, zerr := s.unitRepo.FindByIDLight(zoneIDTrim); zerr == nil && zu != nil {
				payload["to_zone_name"] = zu.Name
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
		}

		// Counter / user transfer (existing behaviour + sync waiting pool from target counter).
		var targetCounterID string
		if in.ToCounterID != nil && strings.TrimSpace(*in.ToCounterID) != "" {
			targetCounterID = strings.TrimSpace(*in.ToCounterID)
		} else {
			counter, uerr := s.counterRepo.FindByUserIDTx(tx, strings.TrimSpace(*in.ToUserID))
			if uerr != nil {
				if errors.Is(uerr, gorm.ErrRecordNotFound) {
					return ErrCounterNotFoundForUser
				}
				return uerr
			}
			targetCounterID = counter.ID
		}

		targetCounter, err := s.counterRepo.FindByIDTx(tx, targetCounterID)
		if err != nil {
			return err
		}
		if targetCounter.UnitID != ticket.UnitID {
			return ErrCounterUnitMismatch
		}

		curSvc, err := s.serviceRepo.FindByIDTx(tx, ticket.ServiceID)
		if err != nil {
			return err
		}
		explicitToSvc := in.ToServiceID != nil && strings.TrimSpace(*in.ToServiceID) != ""
		if explicitToSvc {
			resolvedServiceID := strings.TrimSpace(*in.ToServiceID)
			newSvc, err := s.serviceRepo.FindByIDTx(tx, resolvedServiceID)
			if err != nil {
				return err
			}
			if newSvc.UnitID != ticket.UnitID {
				return ErrTicketServiceNotInUnit
			}
			if !newSvc.IsLeaf {
				return ErrTransferTargetMustBeLeafService
			}
			if !ServiceAllowedInTicketPool(newSvc, targetCounter.ServiceZoneID) {
				return ErrTransferServiceNotAllowedOnTargetCounter
			}
			ticket.ServiceID = resolvedServiceID
			ticket.MaxWaitingTime = newSvc.MaxWaitingTime
		} else if !ServiceAllowedInTicketPool(curSvc, targetCounter.ServiceZoneID) {
			return ErrTransferServiceRequiredForZone
		}

		toSvc, svcErr := s.serviceRepo.FindByIDTx(tx, ticket.ServiceID)
		if svcErr != nil {
			return svcErr
		}

		fromZoneBefore := ticket.ServiceZoneID

		ticket.CounterID = &targetCounterID
		ticket.Status = "waiting"
		ticket.ServiceZoneID = targetCounter.ServiceZoneID
		ticket.CalledAt = nil
		ticket.ConfirmedAt = nil
		ticket.MaxServiceTime = nil
		// Clear served_by so statistics don't attribute the waiting period to the previous operator.
		ticket.ServedByUserID = nil

		payload := map[string]interface{}{
			"transfer_kind":        "counter",
			"unit_id":              ticket.UnitID,
			"service_id":           ticket.ServiceID,
			"from_status":          fromStatus,
			"to_status":            "waiting",
			"to_counter_id":        targetCounterID,
			"to_service_zone_id":   serviceZoneIDJSON(ticket.ServiceZoneID),
			"from_service_id":      fromServiceID,
			"to_service_id":        ticket.ServiceID,
			"from_service_label":   curSvc.Name,
			"to_service_label":     toSvc.Name,
			"from_service_zone_id": serviceZoneIDJSON(fromZoneBefore),
		}
		if curSvc.NameRu != nil && strings.TrimSpace(*curSvc.NameRu) != "" {
			payload["from_service_name_ru"] = strings.TrimSpace(*curSvc.NameRu)
		}
		if curSvc.NameEn != nil && strings.TrimSpace(*curSvc.NameEn) != "" {
			payload["from_service_name_en"] = strings.TrimSpace(*curSvc.NameEn)
		}
		if toSvc.NameRu != nil && strings.TrimSpace(*toSvc.NameRu) != "" {
			payload["to_service_name_ru"] = strings.TrimSpace(*toSvc.NameRu)
		}
		if toSvc.NameEn != nil && strings.TrimSpace(*toSvc.NameEn) != "" {
			payload["to_service_name_en"] = strings.TrimSpace(*toSvc.NameEn)
		}
		if n, ok := s.resolveFromZoneNameForTransferPayload(fromZoneBefore, ticket.UnitID); ok {
			payload["from_zone_name"] = n
		}
		if targetCounter.ServiceZoneID != nil {
			if zu, zerr := s.unitRepo.FindByIDLight(strings.TrimSpace(*targetCounter.ServiceZoneID)); zerr == nil && zu != nil {
				payload["to_zone_name"] = zu.Name
			}
		}
		if in.ToUserID != nil {
			payload["target_user_id"] = strings.TrimSpace(*in.ToUserID)
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
		if errors.Is(err, ErrCounterNotFoundForUser) {
			return nil, ErrCounterNotFoundForUser
		}
		return nil, err
	}

	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
}

// resolveFromZoneNameForTransferPayload sets from_zone_name in transfer history payloads:
// prefer the name of fromZoneID when set, otherwise the subdivision unit name.
func (s *ticketService) resolveFromZoneNameForTransferPayload(fromZoneID *string, ticketUnitID string) (name string, ok bool) {
	if fromZoneID != nil {
		zu, zerr := s.unitRepo.FindByIDLight(strings.TrimSpace(*fromZoneID))
		if zerr != nil || zu == nil {
			return "", false
		}
		return zu.Name, true
	}
	u, uerr := s.unitRepo.FindByIDLight(ticketUnitID)
	if uerr != nil || u == nil {
		return "", false
	}
	return u.Name, true
}

func serviceZoneIDJSON(z *string) interface{} {
	if z == nil {
		return nil
	}
	return *z
}

func (s *ticketService) patchOperatorCommentOnLockedTicketTx(tx *gorm.DB, ticket *models.Ticket, comment *string, actorUserID *string) error {
	var stored *string
	if comment != nil {
		v := strings.TrimSpace(*comment)
		if v == "" {
			stored = nil
		} else {
			if utf8.RuneCountInString(v) > maxOperatorCommentRunes {
				return ErrOperatorCommentTooLong
			}
			stored = &v
		}
	}

	var from *string
	if ticket.OperatorComment != nil {
		c := *ticket.OperatorComment
		from = &c
	}
	if (from == nil && stored == nil) || (from != nil && stored != nil && *from == *stored) {
		return nil
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
}

// ReturnToQueue moves the ticket back to waiting and clears counter assignment / call timestamps.
// service_id and service_zone_id are intentionally left unchanged so the ticket stays in the same waiting pool.
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
		ticket.MaxServiceTime = nil

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
	var ticket *models.Ticket
	err := s.repo.Transaction(func(tx *gorm.DB) error {
		t, err := s.repo.FindByIDForUpdateTx(tx, ticketID)
		if err != nil {
			return err
		}
		ticket = t
		return s.patchOperatorCommentOnLockedTicketTx(tx, ticket, comment, actorUserID)
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
				profChanges := make(map[string]interface{})
				if in.FirstName != nil && newFirst != c.FirstName {
					profChanges["firstName"] = map[string]string{"from": c.FirstName, "to": newFirst}
				}
				if in.LastName != nil && newLast != c.LastName {
					profChanges["lastName"] = map[string]string{"from": c.LastName, "to": newLast}
				}
				if err := s.clientRepo.UpdateNamesTx(tx, c.ID, newFirst, newLast); err != nil {
					return err
				}
				if len(profChanges) > 0 {
					profPl := map[string]interface{}{
						"source":   "staff_ticket",
						"ticketId": ticket.ID,
						"changes":  profChanges,
					}
					if err := writeUnitClientHistoryTx(tx, s.unitClientHistRepo, ticket.UnitID, c.ID, actorUserID, models.UnitClientHistoryActionProfileUpdated, profPl); err != nil {
						return err
					}
				}
			}
		} else {
			e164, err := phoneutil.ParseAndNormalize(phoneTrim, phoneutil.DefaultRegion())
			if err != nil {
				return fmt.Errorf("%w: %w", ErrVisitorPhoneInvalid, err)
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

	ticket, err = s.repo.FindByID(ticketID)
	if err != nil {
		return nil, err
	}
	s.hub.BroadcastEvent("ticket.updated", ticket, ticket.UnitID)
	return ticket, nil
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
		if err := s.writeTicketHistoryTx(tx, ticket.ID, actorUserID, ticketaudit.ActionTicketVisitorTagsUpdated, payload); err != nil {
			return err
		}
		if len(addedIDs) == 0 && len(removedIDs) == 0 {
			return nil
		}
		clientTagPayload := map[string]interface{}{
			"source":           "staff_ticket",
			"ticketId":         ticket.ID,
			"reason":           reason,
			"fromTagIds":       fromCopy,
			"toTagIds":         toCopy,
			"addedTagIds":      addedIDs,
			"removedTagIds":    removedIDs,
			"addedTagLabels":   addedLabels,
			"removedTagLabels": removedLabels,
		}
		return writeUnitClientHistoryTx(tx, s.unitClientHistRepo, ticket.UnitID, client.ID, actorUserID, models.UnitClientHistoryActionTagsUpdated, clientTagPayload)
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
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}
	fetchLimit := limit + 1
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
	items, err := s.repo.ListVisitsByClientID(unitID, clientID, fetchLimit, beforeTime, beforeID)
	if err != nil {
		return nil, nil, err
	}
	displayItems := items
	if len(items) > limit {
		displayItems = items[:limit]
	}
	if len(displayItems) > 0 {
		ids := make([]string, 0, len(displayItems))
		for i := range displayItems {
			ids = append(ids, displayItems[i].ID)
		}
		byID, err := s.repo.ListTerminalVisitActorNamesByTicketIDs(ids)
		if err != nil {
			return nil, nil, err
		}
		for i := range displayItems {
			if name, ok := byID[displayItems[i].ID]; ok && name != "" {
				n := name
				displayItems[i].ServedByName = &n
			}
		}
		if err := s.hydrateClientVisitTransferTrails(displayItems); err != nil {
			return nil, nil, err
		}
	}
	var next *string
	if len(items) > limit {
		last := displayItems[len(displayItems)-1]
		s := fmt.Sprintf("%s|%s", last.CreatedAt.Format(time.RFC3339Nano), last.ID)
		next = &s
	}
	return displayItems, next, nil
}

func visitHistoryPayloadString(p map[string]interface{}, key string) string {
	v, ok := p[key]
	if !ok || v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

func (s *ticketService) hydrateClientVisitTransferTrails(tickets []models.Ticket) error {
	if len(tickets) == 0 {
		return nil
	}
	ids := make([]string, len(tickets))
	for i := range tickets {
		ids[i] = tickets[i].ID
	}
	rows, err := s.repo.ListTransferHistoriesByTicketIDs(ids)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	type transferHistoryParsed struct {
		h models.TicketHistory
		p map[string]interface{}
	}

	byTicket := make(map[string][]transferHistoryParsed)
	svcSeen := make(map[string]struct{})
	var svcIDs []string
	ctrSeen := make(map[string]struct{})
	var ctrIDs []string
	zoneSeen := make(map[string]struct{})
	var zoneIDs []string
	unitSeen := make(map[string]struct{})
	var unitIDs []string

	addSvc := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := svcSeen[id]; ok {
			return
		}
		svcSeen[id] = struct{}{}
		svcIDs = append(svcIDs, id)
	}
	addCtr := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := ctrSeen[id]; ok {
			return
		}
		ctrSeen[id] = struct{}{}
		ctrIDs = append(ctrIDs, id)
	}
	addZone := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := zoneSeen[id]; ok {
			return
		}
		zoneSeen[id] = struct{}{}
		zoneIDs = append(zoneIDs, id)
	}
	addUnit := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := unitSeen[id]; ok {
			return
		}
		unitSeen[id] = struct{}{}
		unitIDs = append(unitIDs, id)
	}

	for _, h := range rows {
		if len(h.Payload) == 0 {
			continue
		}
		var p map[string]interface{}
		if err := json.Unmarshal(h.Payload, &p); err != nil || len(p) == 0 {
			continue
		}
		addSvc(visitHistoryPayloadString(p, "from_service_id"))
		addSvc(visitHistoryPayloadString(p, "to_service_id"))
		addCtr(visitHistoryPayloadString(p, "from_counter_id"))
		addCtr(visitHistoryPayloadString(p, "to_counter_id"))
		if visitHistoryPayloadString(p, "to_zone_name") == "" {
			addZone(visitHistoryPayloadString(p, "to_service_zone_id"))
		}
		addZone(visitHistoryPayloadString(p, "from_service_zone_id"))
		if visitHistoryPayloadString(p, "transfer_kind") == "zone" &&
			visitHistoryPayloadString(p, "from_service_zone_id") == "" {
			addUnit(visitHistoryPayloadString(p, "unit_id"))
		}
		byTicket[h.TicketID] = append(byTicket[h.TicketID], transferHistoryParsed{h: h, p: p})
	}

	svcMap, err := s.serviceRepo.FindMapByIDs(svcIDs)
	if err != nil {
		return err
	}
	ctrMap, err := s.counterRepo.FindMapByIDs(ctrIDs)
	if err != nil {
		return err
	}
	zoneLabels := make(map[string]string, len(zoneIDs))
	for _, zid := range zoneIDs {
		u, uerr := s.unitRepo.FindByIDLight(zid)
		if uerr != nil || u == nil {
			continue
		}
		n := strings.TrimSpace(u.Name)
		if n != "" {
			zoneLabels[zid] = n
		}
	}
	unitLabels := make(map[string]string, len(unitIDs))
	for _, uid := range unitIDs {
		u, uerr := s.unitRepo.FindByIDLight(uid)
		if uerr != nil || u == nil {
			continue
		}
		n := strings.TrimSpace(u.Name)
		if n != "" {
			unitLabels[uid] = n
		}
	}

	for i := range tickets {
		hist := byTicket[tickets[i].ID]
		if len(hist) == 0 {
			continue
		}
		trail := make([]models.ClientVisitTransferEvent, 0, len(hist))
		for _, row := range hist {
			h := row.h
			p := row.p
			if len(p) == 0 {
				continue
			}
			ev := models.ClientVisitTransferEvent{
				At:           h.CreatedAt.UTC(),
				TransferKind: visitHistoryPayloadString(p, "transfer_kind"),
			}
			fromSID := visitHistoryPayloadString(p, "from_service_id")
			toSID := visitHistoryPayloadString(p, "to_service_id")
			payloadFromLabel := visitHistoryPayloadString(p, "from_service_label")
			payloadFromRu := visitHistoryPayloadString(p, "from_service_name_ru")
			payloadFromEn := visitHistoryPayloadString(p, "from_service_name_en")
			payloadToLabel := visitHistoryPayloadString(p, "to_service_label")
			payloadToRu := visitHistoryPayloadString(p, "to_service_name_ru")
			payloadToEn := visitHistoryPayloadString(p, "to_service_name_en")

			// Prefer current service rows over payload labels so UI matches ticket.service
			// (payload often stores English internal names; Name / NameRu in DB are authoritative).
			ev.FromServiceName = payloadFromLabel
			ev.FromServiceNameRu = payloadFromRu
			ev.FromServiceNameEn = payloadFromEn
			if fromSID != "" {
				if svc := svcMap[fromSID]; svc != nil {
					ev.FromServiceName = strings.TrimSpace(svc.Name)
					ev.FromServiceNameRu = ""
					ev.FromServiceNameEn = ""
					if svc.NameRu != nil {
						ev.FromServiceNameRu = strings.TrimSpace(*svc.NameRu)
					}
					if svc.NameEn != nil {
						ev.FromServiceNameEn = strings.TrimSpace(*svc.NameEn)
					}
				}
			}
			if ev.FromServiceName == "" {
				ev.FromServiceName = payloadFromLabel
			}
			if ev.FromServiceNameRu == "" {
				ev.FromServiceNameRu = payloadFromRu
			}
			if ev.FromServiceNameEn == "" {
				ev.FromServiceNameEn = payloadFromEn
			}

			ev.ToServiceName = payloadToLabel
			ev.ToServiceNameRu = payloadToRu
			ev.ToServiceNameEn = payloadToEn
			if toSID != "" {
				if svc := svcMap[toSID]; svc != nil {
					ev.ToServiceName = strings.TrimSpace(svc.Name)
					ev.ToServiceNameRu = ""
					ev.ToServiceNameEn = ""
					if svc.NameRu != nil {
						ev.ToServiceNameRu = strings.TrimSpace(*svc.NameRu)
					}
					if svc.NameEn != nil {
						ev.ToServiceNameEn = strings.TrimSpace(*svc.NameEn)
					}
				}
			}
			if ev.ToServiceName == "" {
				ev.ToServiceName = payloadToLabel
			}
			if ev.ToServiceNameRu == "" {
				ev.ToServiceNameRu = payloadToRu
			}
			if ev.ToServiceNameEn == "" {
				ev.ToServiceNameEn = payloadToEn
			}
			fromCID := visitHistoryPayloadString(p, "from_counter_id")
			toCID := visitHistoryPayloadString(p, "to_counter_id")
			if fromCID != "" {
				if c := ctrMap[fromCID]; c != nil {
					ev.FromCounterName = strings.TrimSpace(c.Name)
				}
			}
			if toCID != "" {
				if c := ctrMap[toCID]; c != nil {
					ev.ToCounterName = strings.TrimSpace(c.Name)
				}
			}
			ev.ToZoneLabel = visitHistoryPayloadString(p, "to_zone_name")
			if ev.ToZoneLabel == "" {
				tzid := visitHistoryPayloadString(p, "to_service_zone_id")
				if tzid != "" {
					ev.ToZoneLabel = zoneLabels[tzid]
				}
			}
			ev.FromZoneLabel = visitHistoryPayloadString(p, "from_zone_name")
			fzid := visitHistoryPayloadString(p, "from_service_zone_id")
			if ev.FromZoneLabel == "" && fzid != "" {
				ev.FromZoneLabel = zoneLabels[fzid]
			}
			if ev.FromZoneLabel == "" && visitHistoryPayloadString(p, "transfer_kind") == "zone" && fzid == "" {
				uid := visitHistoryPayloadString(p, "unit_id")
				if uid != "" {
					if n := unitLabels[uid]; n != "" {
						ev.FromZoneLabel = n
					}
				}
			}
			trail = append(trail, ev)
		}
		if len(trail) > 0 {
			tickets[i].TransferTrail = trail
		}
	}
	return nil
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
