package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/calendar/caldavclient"
	"quokkaq-go-backend/internal/calendar/icalpatch"
	"quokkaq-go-backend/internal/calendar/summary"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/ssocrypto"
	"quokkaq-go-backend/internal/repository"

	"github.com/emersion/go-ical"
	"gorm.io/gorm"
)

// Calendar errors for HTTP mapping.
var (
	ErrCalendarSlotTaken        = errors.New("calendar slot already taken or changed")
	ErrCalendarSlotNotFree      = errors.New("calendar slot is not available")
	ErrCalendarIntegrationOff   = errors.New("calendar integration is not configured for this unit")
	ErrCalendarValidationFailed = errors.New("calendar validation failed")
)

// CalendarIntegrationService syncs Yandex CalDAV and mirrors pre-registration state into events.
type CalendarIntegrationService struct {
	repo        *repository.CalendarIntegrationRepository
	serviceRepo repository.ServiceRepository
	mail        MailService
	appBaseURL  string
}

func NewCalendarIntegrationService(
	repo *repository.CalendarIntegrationRepository,
	serviceRepo repository.ServiceRepository,
	mail MailService,
) *CalendarIntegrationService {
	base := strings.TrimRight(os.Getenv("APP_BASE_URL"), "/")
	return &CalendarIntegrationService{
		repo:        repo,
		serviceRepo: serviceRepo,
		mail:        mail,
		appBaseURL:  base,
	}
}

func (s *CalendarIntegrationService) clientForIntegration(integ *models.UnitCalendarIntegration) (*caldavclient.Client, error) {
	raw, err := ssocrypto.DecryptAES256GCM(integ.AppPasswordEncrypted)
	if err != nil {
		return nil, err
	}
	return caldavclient.NewYandexClient(integ.Username, string(raw))
}

// GetIntegration returns integration row for a unit (nil if not found).
func (s *CalendarIntegrationService) GetIntegration(unitID string) (*models.UnitCalendarIntegration, error) {
	row, err := s.repo.GetByUnitID(unitID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return row, err
}

// CalendarIntegrationPublic is safe for API responses (no secrets).
type CalendarIntegrationPublic struct {
	Enabled           bool       `json:"enabled"`
	CaldavBaseURL     string     `json:"caldavBaseUrl"`
	CalendarPath      string     `json:"calendarPath"`
	Username          string     `json:"username"`
	Timezone          string     `json:"timezone"`
	AdminNotifyEmails string     `json:"adminNotifyEmails,omitempty"`
	LastSyncAt        *time.Time `json:"lastSyncAt,omitempty"`
	LastSyncError     string     `json:"lastSyncError,omitempty"`
	ReadOnlyCapacity  bool       `json:"readOnlyCapacity"`
}

// GetPublic returns integration settings for admins.
func (s *CalendarIntegrationService) GetPublic(unitID string) (*CalendarIntegrationPublic, error) {
	row, err := s.repo.GetByUnitID(unitID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &CalendarIntegrationPublic{ReadOnlyCapacity: false}, nil
	}
	if err != nil {
		return nil, err
	}
	return &CalendarIntegrationPublic{
		Enabled:           row.Enabled,
		CaldavBaseURL:     row.CaldavBaseURL,
		CalendarPath:      row.CalendarPath,
		Username:          row.Username,
		Timezone:          row.Timezone,
		AdminNotifyEmails: row.AdminNotifyEmails,
		LastSyncAt:        row.LastSyncAt,
		LastSyncError:     row.LastSyncError,
		ReadOnlyCapacity:  row.Enabled,
	}, nil
}

// UpsertIntegrationRequest is the admin payload (password optional when unchanged).
type UpsertIntegrationRequest struct {
	Enabled           bool   `json:"enabled"`
	CaldavBaseURL     string `json:"caldavBaseUrl"`
	CalendarPath      string `json:"calendarPath"`
	Username          string `json:"username"`
	AppPassword       string `json:"appPassword,omitempty"`
	Timezone          string `json:"timezone"`
	AdminNotifyEmails string `json:"adminNotifyEmails,omitempty"`
}

// Upsert saves integration; encrypts app password when provided.
func (s *CalendarIntegrationService) UpsertIntegration(unitID string, req *UpsertIntegrationRequest) (*CalendarIntegrationPublic, error) {
	existing, err := s.repo.GetByUnitID(unitID)
	hasExisting := err == nil
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := models.UnitCalendarIntegration{
		UnitID:            unitID,
		Enabled:           req.Enabled,
		CaldavBaseURL:     req.CaldavBaseURL,
		CalendarPath:      req.CalendarPath,
		Username:          req.Username,
		Timezone:          req.Timezone,
		AdminNotifyEmails: req.AdminNotifyEmails,
	}
	if req.CaldavBaseURL == "" {
		row.CaldavBaseURL = "https://caldav.yandex.ru"
	}
	if req.Timezone == "" {
		row.Timezone = "Europe/Moscow"
	}
	if hasExisting {
		row.AppPasswordEncrypted = existing.AppPasswordEncrypted
		row.ID = existing.ID
		row.CreatedAt = existing.CreatedAt
	}
	if strings.TrimSpace(req.AppPassword) != "" {
		enc, encErr := ssocrypto.EncryptAES256GCM([]byte(strings.TrimSpace(req.AppPassword)))
		if encErr != nil {
			return nil, encErr
		}
		row.AppPasswordEncrypted = enc
	} else if !hasExisting {
		return nil, fmt.Errorf("app password is required for new calendar integration")
	}
	if err := s.repo.SaveIntegration(&row); err != nil {
		return nil, err
	}
	return s.GetPublic(unitID)
}

// SyncUnit pulls CalDAV events into calendar_external_slots and handles orphan detection.
func (s *CalendarIntegrationService) SyncUnit(ctx context.Context, unitID string) error {
	integ, err := s.repo.GetByUnitID(unitID)
	if errors.Is(err, gorm.ErrRecordNotFound) || !integ.Enabled {
		return nil
	}
	if err != nil {
		return err
	}
	client, err := s.clientForIntegration(integ)
	if err != nil {
		_ = s.markSyncError(integ.ID, err.Error())
		return err
	}
	loc, err := time.LoadLocation(integ.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	startOfYesterday := todayStart.AddDate(0, 0, -1)
	end := now.AddDate(0, 0, 90)

	syncStart := time.Now().UTC()
	objs, err := client.QueryVEvents(ctx, integ.CalendarPath, startOfYesterday.UTC(), end.UTC())
	if err != nil {
		_ = s.markSyncError(integ.ID, err.Error())
		return err
	}

	// Include services defined on child units (zones) under the same subdivision branch.
	svcRows, err := s.serviceRepo.FindAllByUnitSubtree(unitID)
	if err != nil {
		return err
	}
	labelToServiceID := map[string]string{}
	for i := range svcRows {
		svc := &svcRows[i]
		if !svc.Prebook {
			continue
		}
		lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
		lbl = strings.TrimSpace(lbl)
		if lbl != "" {
			labelToServiceID[strings.ToLower(lbl)] = svc.ID
		}
	}

	seen := make(map[string]struct{})
	for i := range objs {
		co := &objs[i]
		if co.Data == nil {
			continue
		}
		evs := co.Data.Events()
		if len(evs) == 0 {
			continue
		}
		e := evs[0]
		st, _ := e.Status()
		if st == ical.EventCancelled {
			continue
		}
		sum, _ := e.Props.Text(ical.PropSummary)
		p := summary.Parse(sum)
		startUTC, err1 := e.DateTimeStart(time.UTC)
		endUTC, err2 := e.DateTimeEnd(time.UTC)
		if err1 != nil || err2 != nil {
			continue
		}
		uid, _ := e.Props.Text(ical.PropUID)
		var rec *string
		if p := e.Props.Get(ical.PropRecurrenceID); p != nil {
			t := strings.TrimSpace(p.Value)
			rec = &t
		}
		svcID, ok := labelToServiceID[strings.ToLower(strings.TrimSpace(p.ServiceLabel))]
		var svcPtr *string
		if ok {
			svcPtr = &svcID
		}
		row := models.CalendarExternalSlot{
			UnitID:        unitID,
			IntegrationID: integ.ID,
			Href:          co.Path,
			ICalUID:       uid,
			RecurrenceID:  rec,
			ETag:          co.ETag,
			StartUTC:      startUTC.UTC(),
			EndUTC:        endUTC.UTC(),
			Summary:       sum,
			ParsedState:   p.State,
			ServiceID:     svcPtr,
		}
		if err := s.repo.UpsertExternalSlot(&row); err != nil {
			log.Printf("calendar sync: upsert slot: %v", err)
			continue
		}
		seen[co.Path] = struct{}{}
	}

	if err := s.repo.DeleteSlotsNotSeenSince(integ.ID, syncStart); err != nil {
		return err
	}

	preRegs, err := s.repo.ListActivePreRegistrationsWithExternal(unitID)
	if err != nil {
		return err
	}
	for i := range preRegs {
		pr := &preRegs[i]
		if pr.ExternalEventHref == nil || *pr.ExternalEventHref == "" {
			continue
		}
		href := *pr.ExternalEventHref
		if _, ok := seen[href]; ok {
			continue
		}
		co, gerr := client.GetEvent(ctx, href)
		if gerr == nil && co != nil {
			continue
		}
		// Missing from calendar
		_ = s.raiseOrphanIncident(unitID, integ, pr, href)
	}

	_ = s.repo.UpdateSyncMeta(integ.ID, time.Now().UTC(), "")
	return nil
}

func (s *CalendarIntegrationService) markSyncError(id, msg string) error {
	return s.repo.UpdateSyncMeta(id, time.Now().UTC(), msg)
}

func (s *CalendarIntegrationService) raiseOrphanIncident(unitID string, integ *models.UnitCalendarIntegration, pr *models.PreRegistration, href string) error {
	const typ = "orphan_booking_missing_event"
	recent, _ := s.repo.HasRecentIncident(unitID, typ, href, time.Now().Add(-24*time.Hour))
	if recent {
		return nil
	}
	inc := models.CalendarSyncIncident{
		UnitID:            unitID,
		Type:              typ,
		PreRegistrationID: &pr.ID,
		ExternalHref:      href,
		Detail:            fmt.Sprintf("pre-registration %s still active but calendar event missing", pr.ID),
	}
	if err := s.repo.CreateIncident(&inc); err != nil {
		return err
	}
	s.notifyAdminsOrphan(integ, pr, href, inc.ID)
	return nil
}

func (s *CalendarIntegrationService) notifyAdminsOrphan(integ *models.UnitCalendarIntegration, pr *models.PreRegistration, href, incidentID string) {
	if strings.TrimSpace(integ.AdminNotifyEmails) == "" {
		return
	}
	for _, to := range strings.Split(integ.AdminNotifyEmails, ",") {
		to = strings.TrimSpace(to)
		if to == "" {
			continue
		}
		link := s.appBaseURL + "/admin"
		body := fmt.Sprintf(`<p>Calendar event was removed but a pre-registration still exists.</p>
<p><b>Pre-registration</b>: %s<br/><b>Service</b>: %s<br/><b>Time</b>: %s %s<br/><b>Href</b>: %s</p>
<p><a href="%s">Open app</a></p>`,
			pr.ID, pr.ServiceID, pr.Date, pr.Time, href, link)
		if err := s.mail.SendMail(to, "QuokkaQ: calendar slot removed with active booking", body); err != nil {
			log.Printf("calendar orphan email: %v", err)
			continue
		}
		_ = s.repo.MarkIncidentEmailSent(incidentID)
	}
}

// ListCalendarSlots returns free slots for a service/date when integration is enabled.
func (s *CalendarIntegrationService) ListCalendarSlots(unitID, serviceID, date string) ([]models.PreRegCalendarSlotItem, error) {
	integ, err := s.repo.GetByUnitID(unitID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if !integ.Enabled {
		return nil, nil
	}
	loc, err := time.LoadLocation(integ.Timezone)
	if err != nil {
		loc = time.UTC
	}
	rows, err := s.repo.ListExternalSlotsForServiceDate(unitID, serviceID, date, loc)
	if err != nil {
		return nil, err
	}
	out := make([]models.PreRegCalendarSlotItem, 0, len(rows))
	for i := range rows {
		r := &rows[i]
		startLocal := r.StartUTC.In(loc)
		t := startLocal.Format("15:04")
		etag := r.ETag
		out = append(out, models.PreRegCalendarSlotItem{
			Time:              t,
			ExternalEventHref: r.Href,
			ETag:              etag,
		})
	}
	return out, nil
}

// ValidateAndApplyBooked updates the calendar to [Забронирован] after DB row is created.
func (s *CalendarIntegrationService) ValidateAndApplyBooked(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, href, etag string, pr *models.PreRegistration) (newETag string, err error) {
	client, err := s.clientForIntegration(integ)
	if err != nil {
		return "", err
	}
	co, err := client.GetEvent(ctx, href)
	if err != nil {
		return "", err
	}
	if co == nil || co.Data == nil {
		return "", ErrCalendarValidationFailed
	}
	evs := co.Data.Events()
	if len(evs) == 0 {
		return "", ErrCalendarValidationFailed
	}
	sum, _ := evs[0].Props.Text(ical.PropSummary)
	p := summary.Parse(sum)
	if p.State != summary.StateFree {
		return "", ErrCalendarSlotNotFree
	}
	lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
	booked := summary.FormatBooked(lbl)
	desc := s.bookingDescription(pr)
	if err := icalpatch.ApplySummaryDescription(co.Data, booked, desc); err != nil {
		return "", err
	}
	useETag := etag
	if useETag == "" {
		useETag = co.ETag
	}
	err = client.PutCalendar(ctx, href, useETag, co.Data)
	if err != nil {
		if errors.Is(err, caldavclient.ErrPreconditionFailed) {
			return "", ErrCalendarSlotTaken
		}
		return "", err
	}
	// Re-fetch etag
	co2, err := client.GetEvent(ctx, href)
	if err != nil {
		return "", err
	}
	return co2.ETag, nil
}

func (s *CalendarIntegrationService) bookingDescription(pr *models.PreRegistration) string {
	if s.appBaseURL == "" {
		return fmt.Sprintf("Pre-registration %s", pr.ID)
	}
	return fmt.Sprintf(`Pre-registration %s — %s`, pr.ID, s.appBaseURL)
}

// ApplyTicketFormat sets event title to ticket-waiting format.
func (s *CalendarIntegrationService) ApplyTicketFormat(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, pr *models.PreRegistration, ticket *models.Ticket) error {
	if pr.ExternalEventHref == nil || *pr.ExternalEventHref == "" {
		return nil
	}
	client, err := s.clientForIntegration(integ)
	if err != nil {
		return err
	}
	co, err := client.GetEvent(ctx, *pr.ExternalEventHref)
	if err != nil {
		return err
	}
	lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
	title := summary.FormatTicketWaiting(ticket.QueueNumber, lbl)
	desc := s.bookingDescription(pr)
	if err := icalpatch.ApplySummaryDescription(co.Data, title, desc); err != nil {
		return err
	}
	return client.PutCalendar(ctx, *pr.ExternalEventHref, co.ETag, co.Data)
}

// ReleaseFreeSlot resets event to free template (cancel / admin fix).
func (s *CalendarIntegrationService) ReleaseFreeSlot(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, href, etag string) error {
	client, err := s.clientForIntegration(integ)
	if err != nil {
		return err
	}
	co, err := client.GetEvent(ctx, href)
	if err != nil {
		log.Printf("calendar ReleaseFreeSlot: get %s: %v (treating as done)", href, err)
		return nil
	}
	lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
	free := summary.FormatFree(lbl)
	if err := icalpatch.ApplySummaryDescription(co.Data, free, ""); err != nil {
		return err
	}
	return client.PutCalendar(ctx, href, co.ETag, co.Data)
}
