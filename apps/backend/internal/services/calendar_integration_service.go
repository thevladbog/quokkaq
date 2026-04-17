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
	"github.com/emersion/go-webdav/caldav"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

// MaxCalendarIntegrationsPerUnit limits how many calendar connections a single unit may have.
const MaxCalendarIntegrationsPerUnit = 4

// Calendar errors for HTTP mapping.
var (
	ErrCalendarSlotTaken              = errors.New("calendar slot already taken or changed")
	ErrCalendarSlotNotFree            = errors.New("calendar slot is not available")
	ErrCalendarIntegrationOff         = errors.New("calendar integration is not configured for this unit")
	ErrCalendarValidationFailed       = errors.New("calendar validation failed")
	ErrCalendarIntegrationLimit       = errors.New("maximum number of calendar integrations for this unit reached")
	ErrCalendarIntegrationIDRequired  = errors.New("calendarIntegrationId is required when multiple calendars are enabled")
	ErrCalendarIntegrationKindUnknown = errors.New("unsupported calendar integration kind")
	ErrCalendarUnitCompanyMismatch    = errors.New("unit does not belong to company")
	ErrCalendarAppPasswordRequired    = errors.New("app password is required for new calendar integration")
	// ErrCalendarGoogleCalDAVIdentityImmutable is returned on PUT when the client tries to change CalDAV identity fields for google_caldav.
	ErrCalendarGoogleCalDAVIdentityImmutable = errors.New("caldav base URL, calendar path, and username cannot be changed for Google Calendar connections")
	ErrCalendarEnabledRequired               = errors.New("enabled is required")
	// ErrCalendarIntegrationBlockedByActivePreRegistrations is returned when delete or disable would strand active bookings.
	ErrCalendarIntegrationBlockedByActivePreRegistrations = errors.New("active pre-registrations still reference this calendar integration")
)

// CalendarIntegrationService syncs Yandex CalDAV and mirrors pre-registration state into events.
type CalendarIntegrationService struct {
	repo        *repository.CalendarIntegrationRepository
	serviceRepo repository.ServiceRepository
	unitRepo    repository.UnitRepository
	mail        MailService
	appBaseURL  string
}

func NewCalendarIntegrationService(
	repo *repository.CalendarIntegrationRepository,
	serviceRepo repository.ServiceRepository,
	unitRepo repository.UnitRepository,
	mail MailService,
) *CalendarIntegrationService {
	base := strings.TrimRight(os.Getenv("APP_BASE_URL"), "/")
	return &CalendarIntegrationService{
		repo:        repo,
		serviceRepo: serviceRepo,
		unitRepo:    unitRepo,
		mail:        mail,
		appBaseURL:  base,
	}
}

func (s *CalendarIntegrationService) clientForIntegration(ctx context.Context, integ *models.UnitCalendarIntegration) (*caldavclient.Client, error) {
	kind := strings.TrimSpace(integ.Kind)
	if kind == "" {
		kind = models.CalendarIntegrationKindYandexCalDAV
	}
	switch kind {
	case models.CalendarIntegrationKindYandexCalDAV:
		raw, err := ssocrypto.DecryptAES256GCM(integ.AppPasswordEncrypted)
		if err != nil {
			return nil, err
		}
		return caldavclient.NewYandexClient(strings.TrimSpace(integ.CaldavBaseURL), integ.Username, string(raw))
	case models.CalendarIntegrationKindGoogleCalDAV:
		raw, err := ssocrypto.DecryptAES256GCM(integ.AppPasswordEncrypted)
		if err != nil {
			return nil, err
		}
		cfg := googleCalendarOAuthConfig()
		if cfg == nil {
			return nil, ErrGoogleCalendarOAuthNotConfigured
		}
		rt := strings.TrimSpace(string(raw))
		ts := cfg.TokenSource(ctx, &oauth2.Token{RefreshToken: rt})
		return caldavclient.NewGoogleCalDAVClient(ctx, ts)
	default:
		return nil, ErrCalendarIntegrationKindUnknown
	}
}

// GetIntegration returns the first integration row for a unit (legacy), or nil if none.
func (s *CalendarIntegrationService) GetIntegration(unitID string) (*models.UnitCalendarIntegration, error) {
	row, err := s.repo.GetFirstByUnitID(unitID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return row, err
}

// ResolveIntegrationForRelease picks the calendar row for cancel/reschedule release (legacy rows may lack integration id).
func (s *CalendarIntegrationService) ResolveIntegrationForRelease(pr *models.PreRegistration) (*models.UnitCalendarIntegration, error) {
	if pr.CalendarIntegrationID != nil && strings.TrimSpace(*pr.CalendarIntegrationID) != "" {
		row, err := s.repo.GetByID(strings.TrimSpace(*pr.CalendarIntegrationID))
		if err != nil {
			return nil, err
		}
		if row.UnitID != pr.UnitID {
			return nil, fmt.Errorf("calendar integration does not belong to this unit")
		}
		return row, nil
	}
	enabled, err := s.repo.ListEnabledByUnitID(pr.UnitID)
	if err != nil {
		return nil, err
	}
	if len(enabled) == 0 {
		return nil, nil
	}
	return &enabled[0], nil
}

// ResolveIntegrationForPreReg picks the calendar row for create/cancel/reschedule.
func (s *CalendarIntegrationService) ResolveIntegrationForPreReg(unitID string, optionalIntegrationID string) (*models.UnitCalendarIntegration, error) {
	if strings.TrimSpace(optionalIntegrationID) != "" {
		row, err := s.repo.GetByID(strings.TrimSpace(optionalIntegrationID))
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, fmt.Errorf("calendar integration not found")
			}
			return nil, err
		}
		if row.UnitID != unitID {
			return nil, fmt.Errorf("calendar integration does not belong to this unit")
		}
		return row, nil
	}
	enabled, err := s.repo.ListEnabledByUnitID(unitID)
	if err != nil {
		return nil, err
	}
	if len(enabled) == 0 {
		return nil, nil
	}
	if len(enabled) > 1 {
		return nil, ErrCalendarIntegrationIDRequired
	}
	return &enabled[0], nil
}

// HasEnabledCalendarIntegration reports whether the unit has at least one enabled calendar connection.
func (s *CalendarIntegrationService) HasEnabledCalendarIntegration(unitID string) (bool, error) {
	enabled, err := s.repo.ListEnabledByUnitID(unitID)
	if err != nil {
		return false, err
	}
	return len(enabled) > 0, nil
}

// CalendarIntegrationPublic is safe for API responses (no secrets).
type CalendarIntegrationPublic struct {
	ID                string     `json:"id"`
	UnitID            string     `json:"unitId"`
	UnitName          string     `json:"unitName,omitempty"`
	Kind              string     `json:"kind"`
	DisplayName       string     `json:"displayName,omitempty"`
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

func (s *CalendarIntegrationService) rowToPublic(row *models.UnitCalendarIntegration, unitName string) *CalendarIntegrationPublic {
	kind := strings.TrimSpace(row.Kind)
	if kind == "" {
		kind = models.CalendarIntegrationKindYandexCalDAV
	}
	return &CalendarIntegrationPublic{
		ID:                row.ID,
		UnitID:            row.UnitID,
		UnitName:          unitName,
		Kind:              kind,
		DisplayName:       row.DisplayName,
		Enabled:           row.Enabled,
		CaldavBaseURL:     row.CaldavBaseURL,
		CalendarPath:      row.CalendarPath,
		Username:          row.Username,
		Timezone:          row.Timezone,
		AdminNotifyEmails: row.AdminNotifyEmails,
		LastSyncAt:        row.LastSyncAt,
		LastSyncError:     row.LastSyncError,
		ReadOnlyCapacity:  row.Enabled,
	}
}

// GetPublic returns the first integration's public data (legacy GET /units/{id}/calendar-integration).
func (s *CalendarIntegrationService) GetPublic(unitID, companyID string) (*CalendarIntegrationPublic, error) {
	if err := s.VerifyUnitBelongsToCompany(unitID, companyID); err != nil {
		return nil, err
	}
	row, err := s.repo.GetFirstByUnitID(unitID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &CalendarIntegrationPublic{ReadOnlyCapacity: false}, nil
	}
	if err != nil {
		return nil, err
	}
	return s.rowToPublic(row, ""), nil
}

// ListPublicForCompany returns integrations for all units in the company (admin UI).
func (s *CalendarIntegrationService) ListPublicForCompany(companyID string) ([]CalendarIntegrationPublic, error) {
	rows, err := s.repo.ListByCompanyID(companyID)
	if err != nil {
		return nil, err
	}
	out := make([]CalendarIntegrationPublic, 0, len(rows))
	for i := range rows {
		row := &rows[i]
		uname := ""
		if u, err := s.unitRepo.FindByIDLight(row.UnitID); err == nil && u != nil {
			uname = u.Name
		}
		out = append(out, *s.rowToPublic(row, uname))
	}
	return out, nil
}

// GetPublicByID returns one integration by id (must belong to company — caller verifies).
func (s *CalendarIntegrationService) GetPublicByID(integrationID string) (*CalendarIntegrationPublic, error) {
	row, err := s.repo.GetByID(integrationID)
	if err != nil {
		return nil, err
	}
	uname := ""
	if u, err := s.unitRepo.FindByIDLight(row.UnitID); err == nil && u != nil {
		uname = u.Name
	}
	return s.rowToPublic(row, uname), nil
}

// VerifyUnitBelongsToCompany ensures unit scope for company-scoped APIs.
func (s *CalendarIntegrationService) VerifyUnitBelongsToCompany(unitID, companyID string) error {
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return err
	}
	if u.CompanyID != companyID {
		return ErrCalendarUnitCompanyMismatch
	}
	return nil
}

// CreateCalendarIntegrationRequest is POST /companies/me/calendar-integrations body.
type CreateCalendarIntegrationRequest struct {
	UnitID            string `json:"unitId" binding:"required"`
	Kind              string `json:"kind"`
	DisplayName       string `json:"displayName,omitempty"`
	Enabled           *bool  `json:"enabled" binding:"required"`
	CaldavBaseURL     string `json:"caldavBaseUrl"`
	CalendarPath      string `json:"calendarPath" binding:"required"`
	Username          string `json:"username" binding:"required"`
	AppPassword       string `json:"appPassword" binding:"required"`
	Timezone          string `json:"timezone"`
	AdminNotifyEmails string `json:"adminNotifyEmails,omitempty"`
}

// CreateIntegration validates limits and creates a row.
func (s *CalendarIntegrationService) CreateIntegration(companyID string, req *CreateCalendarIntegrationRequest) (*CalendarIntegrationPublic, error) {
	if req.Enabled == nil {
		return nil, ErrCalendarEnabledRequired
	}
	if err := s.VerifyUnitBelongsToCompany(req.UnitID, companyID); err != nil {
		return nil, err
	}
	n, err := s.repo.CountByUnitID(req.UnitID)
	if err != nil {
		return nil, err
	}
	if n >= MaxCalendarIntegrationsPerUnit {
		return nil, ErrCalendarIntegrationLimit
	}
	kind := strings.TrimSpace(req.Kind)
	if kind == "" {
		kind = models.CalendarIntegrationKindYandexCalDAV
	}
	if kind != models.CalendarIntegrationKindYandexCalDAV {
		return nil, ErrCalendarIntegrationKindUnknown
	}
	row := models.UnitCalendarIntegration{
		UnitID:            req.UnitID,
		Kind:              kind,
		DisplayName:       strings.TrimSpace(req.DisplayName),
		Enabled:           *req.Enabled,
		CaldavBaseURL:     req.CaldavBaseURL,
		CalendarPath:      strings.TrimSpace(req.CalendarPath),
		Username:          strings.TrimSpace(req.Username),
		Timezone:          req.Timezone,
		AdminNotifyEmails: req.AdminNotifyEmails,
	}
	if row.CaldavBaseURL == "" {
		row.CaldavBaseURL = "https://caldav.yandex.ru"
	}
	if row.Timezone == "" {
		row.Timezone = "Europe/Moscow"
	}
	if strings.TrimSpace(req.AppPassword) == "" {
		return nil, ErrCalendarAppPasswordRequired
	}
	enc, encErr := ssocrypto.EncryptAES256GCM([]byte(strings.TrimSpace(req.AppPassword)))
	if encErr != nil {
		return nil, encErr
	}
	row.AppPasswordEncrypted = enc
	if err := s.repo.CreateIntegration(&row); err != nil {
		return nil, err
	}
	return s.GetPublicByID(row.ID)
}

// CreateGoogleIntegration persists a google_caldav row after OAuth (refresh token encrypted like Yandex app password).
func (s *CalendarIntegrationService) CreateGoogleIntegration(companyID, unitID, refreshToken, email, calendarID string) (*CalendarIntegrationPublic, error) {
	if err := s.VerifyUnitBelongsToCompany(unitID, companyID); err != nil {
		return nil, err
	}
	n, err := s.repo.CountByUnitID(unitID)
	if err != nil {
		return nil, err
	}
	if n >= MaxCalendarIntegrationsPerUnit {
		return nil, ErrCalendarIntegrationLimit
	}
	rt := strings.TrimSpace(refreshToken)
	if rt == "" {
		return nil, ErrGoogleCalendarOAuthNoRefreshToken
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return nil, ErrGoogleCalendarOAuthUserinfo
	}
	calID := strings.TrimSpace(calendarID)
	if calID == "" {
		calID = email
	}
	calPath, err := models.GoogleCalDAVEventsCollectionPath(calID)
	if err != nil {
		return nil, err
	}
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return nil, err
	}
	tz := strings.TrimSpace(u.Timezone)
	if tz == "" {
		tz = "Europe/Moscow"
	}
	enc, encErr := ssocrypto.EncryptAES256GCM([]byte(rt))
	if encErr != nil {
		return nil, encErr
	}
	row := models.UnitCalendarIntegration{
		UnitID:               unitID,
		Kind:                 models.CalendarIntegrationKindGoogleCalDAV,
		DisplayName:          fmt.Sprintf("Google (%s)", email),
		Enabled:              true,
		CaldavBaseURL:        models.GoogleCalDAVBaseURL,
		CalendarPath:         calPath,
		Username:             email,
		AppPasswordEncrypted: enc,
		Timezone:             tz,
	}
	if err := s.repo.CreateIntegration(&row); err != nil {
		return nil, err
	}
	return s.GetPublicByID(row.ID)
}

// UpdateCalendarIntegrationRequest is PUT body (unitId changes not allowed in MVP).
type UpdateCalendarIntegrationRequest struct {
	DisplayName       string `json:"displayName,omitempty"`
	Enabled           *bool  `json:"enabled" binding:"required"`
	CaldavBaseURL     string `json:"caldavBaseUrl"`
	CalendarPath      string `json:"calendarPath" binding:"required"`
	Username          string `json:"username" binding:"required"`
	AppPassword       string `json:"appPassword,omitempty"`
	Timezone          string `json:"timezone"`
	AdminNotifyEmails string `json:"adminNotifyEmails,omitempty"`
}

// UpdateIntegration updates fields for an existing integration; companyID scopes access.
func (s *CalendarIntegrationService) UpdateIntegration(companyID, integrationID string, req *UpdateCalendarIntegrationRequest) (*CalendarIntegrationPublic, error) {
	if req.Enabled == nil {
		return nil, ErrCalendarEnabledRequired
	}
	row, err := s.repo.GetByID(integrationID)
	if err != nil {
		return nil, err
	}
	if err := s.VerifyUnitBelongsToCompany(row.UnitID, companyID); err != nil {
		return nil, err
	}
	if row.Enabled && !*req.Enabled {
		n, err := s.repo.CountActivePreRegistrationsForIntegration(integrationID)
		if err != nil {
			return nil, err
		}
		if n > 0 {
			return nil, fmt.Errorf("%w: cannot disable while %d active pre-registrations still reference it", ErrCalendarIntegrationBlockedByActivePreRegistrations, n)
		}
	}
	kind := strings.TrimSpace(row.Kind)
	if kind == "" {
		kind = models.CalendarIntegrationKindYandexCalDAV
	}
	if kind == models.CalendarIntegrationKindGoogleCalDAV {
		reqBase := strings.TrimSpace(req.CaldavBaseURL)
		if reqBase != "" && reqBase != row.CaldavBaseURL {
			return nil, ErrCalendarGoogleCalDAVIdentityImmutable
		}
		reqPath := strings.TrimSpace(req.CalendarPath)
		if reqPath != "" && reqPath != row.CalendarPath {
			return nil, ErrCalendarGoogleCalDAVIdentityImmutable
		}
		reqUser := strings.TrimSpace(req.Username)
		if reqUser != "" && reqUser != row.Username {
			return nil, ErrCalendarGoogleCalDAVIdentityImmutable
		}
		row.DisplayName = strings.TrimSpace(req.DisplayName)
		row.Enabled = *req.Enabled
		row.Timezone = req.Timezone
		row.AdminNotifyEmails = req.AdminNotifyEmails
		row.CaldavBaseURL = models.GoogleCalDAVBaseURL
		if row.Timezone == "" {
			row.Timezone = "Europe/Moscow"
		}
	} else {
		row.DisplayName = strings.TrimSpace(req.DisplayName)
		row.Enabled = *req.Enabled
		row.CaldavBaseURL = req.CaldavBaseURL
		row.CalendarPath = strings.TrimSpace(req.CalendarPath)
		row.Username = strings.TrimSpace(req.Username)
		row.Timezone = req.Timezone
		row.AdminNotifyEmails = req.AdminNotifyEmails
		if row.CaldavBaseURL == "" {
			row.CaldavBaseURL = "https://caldav.yandex.ru"
		}
		if row.Timezone == "" {
			row.Timezone = "Europe/Moscow"
		}
		if strings.TrimSpace(req.AppPassword) != "" {
			enc, encErr := ssocrypto.EncryptAES256GCM([]byte(strings.TrimSpace(req.AppPassword)))
			if encErr != nil {
				return nil, encErr
			}
			row.AppPasswordEncrypted = enc
		}
	}
	if err := s.repo.UpdateIntegration(row); err != nil {
		return nil, err
	}
	return s.GetPublicByID(integrationID)
}

// DeleteIntegration removes an integration if company matches and no active pre-regs reference it.
func (s *CalendarIntegrationService) DeleteIntegration(companyID, integrationID string) error {
	row, err := s.repo.GetByID(integrationID)
	if err != nil {
		return err
	}
	if err := s.VerifyUnitBelongsToCompany(row.UnitID, companyID); err != nil {
		return err
	}
	n, err := s.repo.CountActivePreRegistrationsForIntegration(integrationID)
	if err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w: %d active pre-registrations still reference it", ErrCalendarIntegrationBlockedByActivePreRegistrations, n)
	}
	return s.repo.DeleteIntegration(integrationID)
}

// UpsertIntegrationRequest is the admin payload (password optional when unchanged).
type UpsertIntegrationRequest struct {
	Enabled           *bool  `json:"enabled" binding:"required"`
	CaldavBaseURL     string `json:"caldavBaseUrl"`
	CalendarPath      string `json:"calendarPath" binding:"required"`
	Username          string `json:"username" binding:"required"`
	AppPassword       string `json:"appPassword,omitempty"`
	Timezone          string `json:"timezone"`
	AdminNotifyEmails string `json:"adminNotifyEmails,omitempty"`
}

// Upsert saves integration for legacy PUT /units/{unitId}/calendar-integration (updates oldest row or creates).
func (s *CalendarIntegrationService) UpsertIntegration(unitID, companyID string, req *UpsertIntegrationRequest) (*CalendarIntegrationPublic, error) {
	if req.Enabled == nil {
		return nil, ErrCalendarEnabledRequired
	}
	if err := s.VerifyUnitBelongsToCompany(unitID, companyID); err != nil {
		return nil, err
	}
	existing, err := s.repo.GetFirstByUnitID(unitID)
	hasExisting := err == nil
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := models.UnitCalendarIntegration{
		Kind:              models.CalendarIntegrationKindYandexCalDAV,
		UnitID:            unitID,
		Enabled:           *req.Enabled,
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
		row.Kind = existing.Kind
		if row.Kind == "" {
			row.Kind = models.CalendarIntegrationKindYandexCalDAV
		}
		row.DisplayName = existing.DisplayName
	}
	if strings.TrimSpace(req.AppPassword) != "" {
		enc, encErr := ssocrypto.EncryptAES256GCM([]byte(strings.TrimSpace(req.AppPassword)))
		if encErr != nil {
			return nil, encErr
		}
		row.AppPasswordEncrypted = enc
	} else if !hasExisting {
		return nil, ErrCalendarAppPasswordRequired
	}
	if !hasExisting {
		n, cerr := s.repo.CountByUnitID(unitID)
		if cerr != nil {
			return nil, cerr
		}
		if n >= MaxCalendarIntegrationsPerUnit {
			return nil, ErrCalendarIntegrationLimit
		}
		if err := s.repo.CreateIntegration(&row); err != nil {
			return nil, err
		}
	} else {
		if err := s.repo.UpdateIntegration(&row); err != nil {
			return nil, err
		}
	}
	return s.GetPublic(unitID, companyID)
}

// SyncIntegration pulls CalDAV events for one integration id.
func (s *CalendarIntegrationService) SyncIntegration(ctx context.Context, integrationID string) error {
	integ, err := s.repo.GetByID(integrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if !integ.Enabled {
		return nil
	}
	unitID := integ.UnitID
	client, err := s.clientForIntegration(ctx, integ)
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
		if pr.CalendarIntegrationID != nil && *pr.CalendarIntegrationID != integ.ID {
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
		if errors.Is(gerr, caldavclient.ErrNotFound) {
			_ = s.raiseOrphanIncident(unitID, integ, pr, href)
			continue
		}
		if gerr != nil {
			log.Printf("calendar sync orphan check: get %s: %v", href, gerr)
		}
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

// ListCalendarSlots returns free slots merged from all enabled integrations for the unit.
func (s *CalendarIntegrationService) ListCalendarSlots(unitID, serviceID, date string) ([]models.PreRegCalendarSlotItem, error) {
	enabled, err := s.repo.ListEnabledByUnitID(unitID)
	if err != nil {
		return nil, err
	}
	if len(enabled) == 0 {
		return nil, nil
	}
	var out []models.PreRegCalendarSlotItem
	for i := range enabled {
		integ := &enabled[i]
		loc, err := time.LoadLocation(integ.Timezone)
		if err != nil {
			loc = time.UTC
		}
		label := strings.TrimSpace(integ.DisplayName)
		if label == "" {
			label = integ.Username
		}
		rows, err := s.repo.ListExternalSlotsForIntegrationServiceDate(integ.ID, unitID, serviceID, date, loc)
		if err != nil {
			return nil, err
		}
		for j := range rows {
			r := &rows[j]
			startLocal := r.StartUTC.In(loc)
			t := startLocal.Format("15:04")
			out = append(out, models.PreRegCalendarSlotItem{
				Time:                  t,
				ExternalEventHref:     r.Href,
				ExternalEventEtag:     r.ETag,
				CalendarIntegrationID: integ.ID,
				IntegrationLabel:      label,
			})
		}
	}
	return out, nil
}

// validateCalendarSlotEligibilityForPreReg performs the same read-only checks used before a booking PUT:
// load the event, ensure the summary is still Free, and when the client sends an ETag it must match the server.
func (s *CalendarIntegrationService) validateCalendarSlotEligibilityForPreReg(ctx context.Context, client *caldavclient.Client, href, clientEtag string) (*caldav.CalendarObject, string, error) {
	co, err := client.GetEvent(ctx, href)
	if err != nil {
		return nil, "", err
	}
	if co == nil || co.Data == nil {
		return nil, "", ErrCalendarValidationFailed
	}
	evs := co.Data.Events()
	if len(evs) == 0 {
		return nil, "", ErrCalendarValidationFailed
	}
	sum, _ := evs[0].Props.Text(ical.PropSummary)
	p := summary.Parse(sum)
	if p.State != summary.StateFree {
		return nil, "", ErrCalendarSlotNotFree
	}
	ct := strings.TrimSpace(clientEtag)
	if ct != "" && ct != strings.TrimSpace(co.ETag) {
		return nil, "", ErrCalendarSlotTaken
	}
	useETag := ct
	if useETag == "" {
		useETag = co.ETag
	}
	return co, useETag, nil
}

// applyBookedFromValidatedEvent applies [Забронирован] to an event that already passed validateCalendarSlotEligibilityForPreReg.
func (s *CalendarIntegrationService) applyBookedFromValidatedEvent(ctx context.Context, client *caldavclient.Client, svc *models.Service, href string, co *caldav.CalendarObject, etagForPut string, pr *models.PreRegistration) (newETag string, err error) {
	lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
	booked := summary.FormatBooked(lbl)
	desc := s.bookingDescription(pr)
	if err := icalpatch.ApplySummaryDescription(co.Data, booked, desc); err != nil {
		return "", err
	}
	putETag, err := client.PutCalendar(ctx, href, etagForPut, co.Data)
	if err != nil {
		if errors.Is(err, caldavclient.ErrPreconditionFailed) {
			return "", ErrCalendarSlotTaken
		}
		return "", err
	}
	if putETag != "" {
		return putETag, nil
	}
	co2, gerr := client.GetEvent(ctx, href)
	if gerr != nil {
		// PUT succeeded; do not fail the booking if read-after-write fails (sync can refresh ETag).
		return "", nil
	}
	if co2 != nil {
		return co2.ETag, nil
	}
	return "", nil
}

// ValidateAndApplyBooked validates the CalDAV slot (free + etag), then updates the calendar to [Забронирован].
// Callers must persist the pre-registration row only after this succeeds (create/reschedule); no DB write should occur before eligibility passes.
func (s *CalendarIntegrationService) ValidateAndApplyBooked(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, href, etag string, pr *models.PreRegistration) (newETag string, err error) {
	client, err := s.clientForIntegration(ctx, integ)
	if err != nil {
		return "", err
	}
	co, etagForPut, err := s.validateCalendarSlotEligibilityForPreReg(ctx, client, href, etag)
	if err != nil {
		return "", err
	}
	return s.applyBookedFromValidatedEvent(ctx, client, svc, href, co, etagForPut, pr)
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
	client, err := s.clientForIntegration(ctx, integ)
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
	_, err = client.PutCalendar(ctx, *pr.ExternalEventHref, co.ETag, co.Data)
	return err
}

// ReleaseFreeSlot resets event to free template (cancel / admin fix).
func (s *CalendarIntegrationService) ReleaseFreeSlot(ctx context.Context, integ *models.UnitCalendarIntegration, svc *models.Service, href, etag string) error {
	client, err := s.clientForIntegration(ctx, integ)
	if err != nil {
		return err
	}
	co, err := client.GetEvent(ctx, href)
	if err != nil {
		if errors.Is(err, caldavclient.ErrNotFound) {
			return nil
		}
		log.Printf("calendar ReleaseFreeSlot: get %s: %v (treating as done)", href, err)
		return nil
	}
	lbl := summary.ServiceLabelForService(svc.Name, svc.CalendarSlotKey)
	free := summary.FormatFree(lbl)
	if err := icalpatch.ApplySummaryDescription(co.Data, free, ""); err != nil {
		return err
	}
	_, err = client.PutCalendar(ctx, href, co.ETag, co.Data)
	return err
}
