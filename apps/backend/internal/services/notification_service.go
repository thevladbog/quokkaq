package services

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// NotificationService orchestrates visitor-facing SMS notifications.
// It creates a Notification row for persistence/retry tracking and enqueues an sms:send Asynq job.
type NotificationService struct {
	notifRepo   repository.NotificationRepository
	unitRepo    repository.UnitRepository
	clientRepo  repository.UnitClientRepository
	jobClient   JobEnqueuer
	settingsSvc *DeploymentSaaSSettingsService
}

// NewNotificationService constructs a NotificationService.
func NewNotificationService(
	notifRepo repository.NotificationRepository,
	unitRepo repository.UnitRepository,
	clientRepo repository.UnitClientRepository,
	jobClient JobEnqueuer,
	settingsSvc *DeploymentSaaSSettingsService,
) *NotificationService {
	return &NotificationService{
		notifRepo:   notifRepo,
		unitRepo:    unitRepo,
		clientRepo:  clientRepo,
		jobClient:   jobClient,
		settingsSvc: settingsSvc,
	}
}

// SendTicketCalledSMS enqueues an SMS notification for the visitor when their ticket is called.
// Silently no-ops if the visitor has no phone, the unit lacks the feature, or SMS is not configured.
func (ns *NotificationService) SendTicketCalledSMS(ticket *models.Ticket) {
	if ticket == nil {
		return
	}
	phone := ns.resolvePhone(ticket)
	if phone == "" {
		return
	}
	// Check feature gate.
	if ok, _ := CompanyHasPlanFeature(ns.resolveCompanyID(ticket.UnitID), "visitor_notifications"); !ok {
		return
	}

	counterName := ""
	if ticket.Counter != nil {
		counterName = ticket.Counter.Name
	}

	// Resolve visitor locale: prefer preloaded Client.Locale, fallback to "ru".
	locale := "ru"
	if ticket.Client != nil && ticket.Client.Locale != nil && *ticket.Client.Locale != "" {
		locale = *ticket.Client.Locale
	} else if ticket.ClientID != nil {
		if c, err := ns.clientRepo.GetByID(*ticket.ClientID); err == nil && c != nil && c.Locale != nil && *c.Locale != "" {
			locale = *c.Locale
		}
	}

	body := ns.buildCalledBody(ticket.QueueNumber, counterName, locale)
	ns.enqueueNotification(ticket.ID, phone, body, "ticket_called")
}

// SendQueuePositionAlert enqueues an SMS notification when the visitor reaches position 1 in the queue.
// Silently no-ops if the visitor has no phone, the unit lacks the feature, or SMS is not configured.
func (ns *NotificationService) SendQueuePositionAlert(ticket *models.Ticket) {
	if ticket == nil {
		return
	}
	phone := ns.resolvePhone(ticket)
	if phone == "" {
		return
	}
	if ok, _ := CompanyHasPlanFeature(ns.resolveCompanyID(ticket.UnitID), "visitor_notifications"); !ok {
		return
	}

	locale := "ru"
	if ticket.Client != nil && ticket.Client.Locale != nil && *ticket.Client.Locale != "" {
		locale = *ticket.Client.Locale
	} else if ticket.ClientID != nil {
		if c, err := ns.clientRepo.GetByID(*ticket.ClientID); err == nil && c != nil && c.Locale != nil && *c.Locale != "" {
			locale = *c.Locale
		}
	}

	body := ns.buildNextInLineBody(ticket.QueueNumber, locale)
	ns.enqueueNotification(ticket.ID, phone, body, "queue_position_alert")
}

func (ns *NotificationService) buildNextInLineBody(queueNumber, locale string) string {
	if locale == "en" {
		return fmt.Sprintf("Your number %s — you're next in line! Please be ready.", queueNumber)
	}
	return fmt.Sprintf("Ваш номер %s — вы следующий в очереди! Приготовьтесь.", queueNumber)
}

// resolvePhone looks up the visitor's E.164 phone from the associated UnitClient.
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

// resolveCompanyID returns the company ID for the given unit (for feature gating).
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

// enqueueNotification creates a Notification row and enqueues an sms:send job.
func (ns *NotificationService) enqueueNotification(ticketID, phone, body, notifType string) {
	if ns.notifRepo == nil || ns.jobClient == nil {
		return
	}
	payload, _ := json.Marshal(map[string]string{
		"ticket_id": ticketID,
		"phone":     phone,
		"body":      body,
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
	}); err != nil {
		slog.Error("notification_service: enqueue sms:send", "notification_id", notif.ID, "err", err)
	}
}
