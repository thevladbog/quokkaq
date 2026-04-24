package services

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// NotificationService orchestrates visitor-facing SMS notifications.
// It creates a Notification row for persistence/retry tracking and enqueues an sms:send Asynq job.
type NotificationService struct {
	notifRepo     repository.NotificationRepository
	unitRepo      repository.UnitRepository
	clientRepo    repository.UnitClientRepository
	companyRepo   repository.CompanyRepository
	ticketRepo    repository.TicketRepository
	shortLinkRepo repository.TicketShortLinkRepository
	funnelRepo    repository.QueueFunnelRepository
	mailService   MailService
	jobClient     JobEnqueuer
	settingsSvc   *DeploymentSaaSSettingsService
}

// NewNotificationService constructs a NotificationService.
// mail is optional: when set, a welcome email can be sent when the ticket has visitorNotificationEmail.
func NewNotificationService(
	notifRepo repository.NotificationRepository,
	unitRepo repository.UnitRepository,
	clientRepo repository.UnitClientRepository,
	companyRepo repository.CompanyRepository,
	ticketRepo repository.TicketRepository,
	shortLinkRepo repository.TicketShortLinkRepository,
	funnelRepo repository.QueueFunnelRepository,
	mailService MailService,
	jobClient JobEnqueuer,
	settingsSvc *DeploymentSaaSSettingsService,
) *NotificationService {
	return &NotificationService{
		notifRepo:     notifRepo,
		unitRepo:      unitRepo,
		clientRepo:    clientRepo,
		companyRepo:   companyRepo,
		ticketRepo:    ticketRepo,
		shortLinkRepo: shortLinkRepo,
		funnelRepo:    funnelRepo,
		mailService:   mailService,
		jobClient:     jobClient,
		settingsSvc:   settingsSvc,
	}
}

func (ns *NotificationService) deploymentOrNil() *models.DeploymentSaaSSettings {
	if ns.settingsSvc == nil {
		return nil
	}
	s, err := ns.settingsSvc.GetIntegrationSettings()
	if err != nil {
		return nil
	}
	return s
}

func (ns *NotificationService) companyByUnit(unitID string) *models.Company {
	cid := ns.resolveCompanyID(unitID)
	if cid == "" || ns.companyRepo == nil {
		return nil
	}
	c, err := ns.companyRepo.FindByID(cid)
	if err != nil {
		return nil
	}
	return c
}

// isSMSChannelAvailable returns true when a non-log provider is configured (tenant or platform) for the unit.
func (ns *NotificationService) isSMSChannelAvailableForUnit(unitID string) bool {
	dep := ns.deploymentOrNil()
	comp := ns.companyByUnit(unitID)
	if SMSEffectivelyEnabled(comp, dep) {
		return true
	}
	// Backward compatible: if deployment is active via env without company row, still ok.
	if dep == nil {
		return false
	}
	return NewSMSProviderFromSettings(dep).Name() != "log"
}

// SendTicketCalledSMS enqueues an SMS notification for the visitor when their ticket is called.
func (ns *NotificationService) SendTicketCalledSMS(ticket *models.Ticket) {
	if ticket == nil {
		return
	}
	if !ns.isSMSChannelAvailableForUnit(ticket.UnitID) {
		return
	}
	phone := ns.resolvePhone(ticket)
	if phone == "" {
		return
	}
	if ok, _ := CompanyHasPlanFeature(ns.resolveCompanyID(ticket.UnitID), "visitor_notifications"); !ok {
		return
	}
	counterName := ""
	if ticket.Counter != nil {
		counterName = ticket.Counter.Name
	}
	locale := ns.resolveVisitorLocale(ticket)
	body := ns.buildCalledBody(ticket.QueueNumber, counterName, locale)
	companyID := ns.resolveCompanyID(ticket.UnitID)
	ns.enqueueSMS(ticket.ID, companyID, phone, body, "ticket_called", ticket.UnitID, ticket)
}

// SendQueuePositionAlert enqueues an SMS when the visitor reaches position 1 in the queue.
func (ns *NotificationService) SendQueuePositionAlert(ticket *models.Ticket) {
	if ticket == nil {
		return
	}
	if !ns.isSMSChannelAvailableForUnit(ticket.UnitID) {
		return
	}
	phone := ns.resolvePhone(ticket)
	if phone == "" {
		return
	}
	if ok, _ := CompanyHasPlanFeature(ns.resolveCompanyID(ticket.UnitID), "visitor_notifications"); !ok {
		return
	}
	locale := ns.resolveVisitorLocale(ticket)
	body := ns.buildNextInLineBody(ticket.QueueNumber, locale)
	companyID := ns.resolveCompanyID(ticket.UnitID)
	ns.enqueueSMS(ticket.ID, companyID, phone, body, "queue_position_alert", ticket.UnitID, ticket)
}

// SendTicketCreatedSMS enqueues a welcome SMS with the ticket number, service, and a short link to the tracking page.
// Idempotent via visitor_welcome_notified_at.
func (ns *NotificationService) SendTicketCreatedSMS(ticket *models.Ticket) {
	if ticket == nil {
		return
	}
	if !ns.isSMSChannelAvailableForUnit(ticket.UnitID) {
		return
	}
	if ok, _ := CompanyHasPlanFeature(ns.resolveCompanyID(ticket.UnitID), "visitor_notifications"); !ok {
		return
	}
	phone := ns.resolvePhone(ticket)
	if phone == "" {
		return
	}
	if ns.notifRepo != nil {
		if has, _ := ns.notifRepo.HasNotificationForTicketType(ticket.ID, "ticket_welcome_sms"); has {
			return
		}
	}
	locale := ns.resolveVisitorLocale(ticket)
	companyID := ns.resolveCompanyID(ticket.UnitID)
	url := ns.buildPublicTicketURL(ticket, companyID, locale)
	body := ns.buildWelcomeBody(ticket, locale, url)
	ns.enqueueSMS(ticket.ID, companyID, phone, body, "ticket_welcome_sms", ticket.UnitID, ticket)
	ns.maybeQueueWelcomeEmail(ticket, companyID, locale, url)
}

func (ns *NotificationService) maybeQueueWelcomeEmail(ticket *models.Ticket, companyID, locale, ticketURL string) {
	if ns.mailService == nil || ns.ticketRepo == nil {
		return
	}
	if ticket.VisitorNotificationEmail == nil || strings.TrimSpace(*ticket.VisitorNotificationEmail) == "" {
		return
	}
	subj := "Ваш талон"
	if locale == "en" {
		subj = "Your queue ticket"
	}
	html := fmt.Sprintf("<p>%s</p><p><a href=%q>Открыть статус</a></p>", subj, ticketURL)
	_ = ns.mailService.SendMail(*ticket.VisitorNotificationEmail, subj, html)
	_ = ns.funnelInsert(ticket, "welcome_email_enqueued", map[string]any{"channel": "email"})
}

func (ns *NotificationService) buildWelcomeBody(t *models.Ticket, locale, url string) string {
	svc := serviceLabel(t)
	if locale == "en" {
		return fmt.Sprintf("Your ticket: %s | Service: %s | Status: %s", t.QueueNumber, svc, url)
	}
	return fmt.Sprintf("Ваш талон: %s | Услуга: %s | Статус: %s", t.QueueNumber, svc, url)
}

func serviceLabel(t *models.Ticket) string {
	if t == nil {
		return "—"
	}
	if t.Service.ID == "" {
		return "—"
	}
	if t.Service.Name != "" {
		return t.Service.Name
	}
	if t.Service.NameRu != nil && *t.Service.NameRu != "" {
		return *t.Service.NameRu
	}
	if t.Service.NameEn != nil && *t.Service.NameEn != "" {
		return *t.Service.NameEn
	}
	return "—"
}

func (ns *NotificationService) buildPublicTicketURL(ticket *models.Ticket, companyID, locale string) string {
	lo := locale
	if lo == "" {
		lo = "ru"
	}
	// Short link when we have a repo; fallback to long URL.
	if ns.shortLinkRepo != nil {
		if code, err := ns.shortLinkRepo.GetOrCreate(ticket.ID, companyID, lo); err == nil {
			base := strings.TrimRight(strings.TrimSpace(os.Getenv("QUOKKAQ_SMS_BASE_URL")), "/")
			if base == "" {
				// /l is served by the API process; in local dev set QUOKKAQ_SMS_BASE_URL to http://localhost:3001
				base = strings.TrimRight(strings.TrimSpace(os.Getenv("APP_BASE_URL")), "/")
			}
			if base == "" {
				base = "http://localhost:3001"
			}
			return fmt.Sprintf("%s/l/%s", base, code)
		}
	}
	return ns.buildLongTicketURL(ticket, lo)
}

func (ns *NotificationService) buildLongTicketURL(ticket *models.Ticket, locale string) string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_BASE_URL")), "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	if locale == "" {
		locale = "ru"
	}
	return fmt.Sprintf("%s/%s/ticket/%s", base, locale, ticket.ID)
}

func (ns *NotificationService) buildNextInLineBody(queueNumber, locale string) string {
	if locale == "en" {
		return fmt.Sprintf("Your number %s — you're next in line! Please be ready.", queueNumber)
	}
	return fmt.Sprintf("Ваш номер %s — вы следующий в очереди! Приготовьтесь.", queueNumber)
}

func (ns *NotificationService) resolveVisitorLocale(ticket *models.Ticket) string {
	locale := "ru"
	if ticket.Client != nil && ticket.Client.Locale != nil && *ticket.Client.Locale != "" {
		locale = *ticket.Client.Locale
	} else if ticket.ClientID != nil {
		if c, err := ns.clientRepo.GetByID(*ticket.ClientID); err == nil && c != nil && c.Locale != nil && *c.Locale != "" {
			locale = *c.Locale
		}
	}
	return locale
}

func (ns *NotificationService) resolvePhone(ticket *models.Ticket) string {
	if ticket.Client != nil && ticket.Client.PhoneE164 != nil && *ticket.Client.PhoneE164 != "" {
		return *ticket.Client.PhoneE164
	}
	if ticket.ClientID == nil {
		return ""
	}
	client, err := ns.clientRepo.GetByID(*ticket.ClientID)
	if err != nil || client == nil {
		return ""
	}
	if client.PhoneE164 == nil {
		return ""
	}
	return *client.PhoneE164
}

func (ns *NotificationService) resolveCompanyID(unitID string) string {
	if ns.unitRepo == nil {
		return ""
	}
	unit, err := ns.unitRepo.FindByID(unitID)
	if err != nil || unit == nil {
		return ""
	}
	return unit.CompanyID
}

func (ns *NotificationService) buildCalledBody(queueNumber, counterName, locale string) string {
	if counterName != "" {
		if locale == "en" {
			return fmt.Sprintf("Your number %s has been called. Please proceed to counter %s.", queueNumber, counterName)
		}
		return fmt.Sprintf("Ваш номер %s вызван. Пройдите к окну %s.", queueNumber, counterName)
	}
	if locale == "en" {
		return fmt.Sprintf("Your number %s has been called. Please approach the service counter.", queueNumber)
	}
	return fmt.Sprintf("Ваш номер %s вызван. Пожалуйста, подойдите на стойку.", queueNumber)
}

// enqueueSMS records notification row and job with tenant/platform routing.
func (ns *NotificationService) enqueueSMS(ticketID, companyID, phone, body, notifType, unitID string, ticket *models.Ticket) {
	if ns.notifRepo == nil || ns.jobClient == nil {
		return
	}
	comp := (*models.Company)(nil)
	if companyID != "" && ns.companyRepo != nil {
		comp, _ = ns.companyRepo.FindByID(companyID)
	}
	dep := ns.deploymentOrNil()
	_, smsSource := ResolveSMSProviderForCompany(comp, dep)
	payload, _ := json.Marshal(map[string]string{
		"ticket_id":   ticketID,
		"phone":       phone,
		"body":        body,
		"company_id":  companyID,
		"sms_source":  smsSource,
		"visitor_not": notifType,
	})
	now := time.Now()
	notif := &models.Notification{
		Type:    notifType,
		Payload: payload,
		Status:  "pending",
		LastAt:  &now,
	}
	if err := ns.notifRepo.Create(notif); err != nil {
		slog.Error("notification_service: create notification row", "err", err)
		return
	}
	if err := ns.jobClient.EnqueueSMSSend(SMSSendJobPayload{
		NotificationID: notif.ID,
		To:             phone,
		Body:           body,
		CompanyID:      companyID,
		SmsSource:      smsSource,
	}); err != nil {
		slog.Error("notification_service: enqueue sms:send", "notification_id", notif.ID, "err", err)
		return
	}
	_ = ns.funnelInsert(ticket, "visitor_sms_queued", map[string]any{"notifType": notifType, "smsSource": smsSource, "unitId": unitID})
}

// EnqueueUnitTransactionalSMS sends a one-off SMS tied to a unit (no ticket, no queue funnel), e.g. OTP or reminders.
func (ns *NotificationService) EnqueueUnitTransactionalSMS(unitID, phone, body, notifType string) error {
	if ns.notifRepo == nil || ns.jobClient == nil {
		return fmt.Errorf("notification service not fully configured")
	}
	companyID := ns.resolveCompanyID(unitID)
	comp := (*models.Company)(nil)
	if companyID != "" && ns.companyRepo != nil {
		comp, _ = ns.companyRepo.FindByID(companyID)
	}
	dep := ns.deploymentOrNil()
	_, smsSource := ResolveSMSProviderForCompany(comp, dep)
	payload, _ := json.Marshal(map[string]string{
		"ticket_id":   "",
		"phone":       phone,
		"body":        body,
		"company_id":  companyID,
		"unit_id":     unitID,
		"visitor_not": notifType,
	})
	now := time.Now()
	notif := &models.Notification{
		Type:    notifType,
		Payload: payload,
		Status:  "pending",
		LastAt:  &now,
	}
	if err := ns.notifRepo.Create(notif); err != nil {
		return err
	}
	if err := ns.jobClient.EnqueueSMSSend(SMSSendJobPayload{
		NotificationID: notif.ID,
		To:             phone,
		Body:           body,
		CompanyID:      companyID,
		SmsSource:      smsSource,
	}); err != nil {
		return err
	}
	return nil
}

// RecordFunnelEvent writes a marketing/analytics event (e.g. ticket created from virtual queue).
func (ns *NotificationService) RecordFunnelEvent(ticket *models.Ticket, event, source string, meta map[string]any) {
	if ns.funnelRepo == nil || ticket == nil {
		return
	}
	if event == "kiosk_sms_step_declined" {
		exists, err := ns.funnelRepo.ExistsByTicketIDAndEvent(ticket.ID, event)
		if err == nil && exists {
			return
		}
	}
	if meta == nil {
		meta = map[string]any{}
	}
	companyID := ns.resolveCompanyID(ticket.UnitID)
	e := &models.QueueFunnelEvent{
		CompanyID: companyID,
		UnitID:    ticket.UnitID,
		TicketID:  ticket.ID,
		Event:     event,
		Source:    source,
		Meta:      repository.FunnelMeta(meta),
	}
	_ = ns.funnelRepo.Insert(e)
}

func (ns *NotificationService) funnelInsert(ticket *models.Ticket, event string, meta map[string]any) error {
	if ns.funnelRepo == nil || ticket == nil {
		return nil
	}
	companyID := ns.resolveCompanyID(ticket.UnitID)
	src := ""
	if meta != nil {
		if s, ok := meta["source"].(string); ok {
			src = s
		}
	}
	e := &models.QueueFunnelEvent{
		CompanyID: companyID,
		UnitID:    ticket.UnitID,
		TicketID:  ticket.ID,
		Event:     event,
		Source:    src,
		Meta:      repository.FunnelMeta(meta),
	}
	if err := ns.funnelRepo.Insert(e); err != nil {
		slog.Error("funnel insert", "err", err)
	}
	return nil
}
