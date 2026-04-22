package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	applogger "quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/hibiken/asynq"
)

// Ensure jobWorker implements JobWorker at compile time.
var _ JobWorker = (*jobWorker)(nil)

type JobWorker interface {
	Start() error
	Stop()
}

type jobWorker struct {
	server     *asynq.Server
	mux        *asynq.ServeMux
	ttsService services.TtsService
	ticketRepo repository.TicketRepository
	notifRepo  repository.NotificationRepository
	// settingsSvc is resolved per-job so runtime SMS config changes take effect immediately.
	settingsSvc  *services.DeploymentSaaSSettingsService
	notifService *services.NotificationService
	anomalySvc   *services.AnomalyService
}

func NewJobWorker(ttsService services.TtsService, ticketRepo repository.TicketRepository) JobWorker {
	redisHost := os.Getenv("REDIS_HOST")
	redisPort := os.Getenv("REDIS_PORT")
	redisPassword := os.Getenv("REDIS_PASSWORD")

	if redisHost == "" {
		redisHost = "localhost"
	}
	if redisPort == "" {
		redisPort = "6379"
	}

	redisAddr := fmt.Sprintf("%s:%s", redisHost, redisPort)

	server := asynq.NewServer(
		asynq.RedisClientOpt{
			Addr:     redisAddr,
			Password: redisPassword,
		},
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
		},
	)

	mux := asynq.NewServeMux()

	w := &jobWorker{
		server:     server,
		mux:        mux,
		ttsService: ttsService,
		ticketRepo: ticketRepo,
	}

	mux.HandleFunc(TypeTTSGenerate, w.handleTtsGenerate)
	mux.HandleFunc(TypeSMSSend, w.handleSMSSend)
	mux.HandleFunc(TypeVisitorNotify, w.handleVisitorNotify)

	return w
}

// NewJobWorkerWithSMS builds a worker that can also deliver SMS notifications.
// settingsSvc is stored (not eagerly resolved) so that runtime changes to SMS
// configuration are picked up on every job without restarting the process.
func NewJobWorkerWithSMS(
	ttsService services.TtsService,
	ticketRepo repository.TicketRepository,
	notifRepo repository.NotificationRepository,
	settingsSvc *services.DeploymentSaaSSettingsService,
) JobWorker {
	base := NewJobWorker(ttsService, ticketRepo).(*jobWorker)
	base.notifRepo = notifRepo
	base.settingsSvc = settingsSvc
	return base
}

// WithNotificationService attaches a NotificationService so the visitor:notify handler
// can delegate to the correct high-level send method.
func WithNotificationService(w JobWorker, ns *services.NotificationService) JobWorker {
	if jw, ok := w.(*jobWorker); ok {
		jw.notifService = ns
	}
	return w
}

// WithAnomalyService registers the periodic anomaly scan handler (TypeAnomalyCheck).
func WithAnomalyService(w JobWorker, a *services.AnomalyService) JobWorker {
	if jw, ok := w.(*jobWorker); ok && a != nil {
		jw.anomalySvc = a
		jw.mux.HandleFunc(TypeAnomalyCheck, jw.handleAnomalyCheck)
	}
	return w
}

func (w *jobWorker) Start() error {
	// Run() also registers SIGINT/SIGTERM and races with main's signal.Notify; Start() + Shutdown() from main avoids that.
	if err := w.server.Start(w.mux); err != nil {
		applogger.Error("could not start asynq worker", "err", err)
		return fmt.Errorf("asynq worker: %w", err)
	}
	return nil
}

func (w *jobWorker) Stop() {
	w.server.Shutdown()
}

func (w *jobWorker) handleTtsGenerate(ctx context.Context, t *asynq.Task) error {
	var p services.TtsJobPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	applogger.InfoContext(ctx, "processing TTS generation",
		"ticket_id", p.TicketID, "queue", p.QueueNumber, "counter", p.CounterName)

	text := fmt.Sprintf("Ticket number %s, please go to counter %s", p.QueueNumber, p.CounterName)
	url, err := w.ttsService.GenerateAndUpload(ctx, text, p.TicketID)
	if err != nil {
		return fmt.Errorf("failed to generate/upload TTS: %v", err)
	}

	applogger.InfoContext(ctx, "TTS generated successfully", "url", url)

	// Update ticket with TTS URL
	ticket, err := w.ticketRepo.FindByID(p.TicketID)
	if err != nil {
		applogger.WarnContext(ctx, "failed to find ticket to update TTS URL", "ticket_id", p.TicketID, "err", err)
		// Not returning error as TTS was generated successfully
		return nil
	}

	ticket.TTSUrl = &url
	if err := w.ticketRepo.Update(ticket); err != nil {
		applogger.WarnContext(ctx, "failed to update ticket with TTS URL", "ticket_id", p.TicketID, "err", err)
		// Not returning error as TTS was generated successfully
	}

	return nil
}

func (w *jobWorker) handleSMSSend(ctx context.Context, t *asynq.Task) error {
	var p SMSSendPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("sms:send unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	applogger.InfoContext(ctx, "processing SMS send", "notification_id", p.NotificationID, "to", services.MaskPhone(p.To))

	// Determine current attempt count from the notification row if repo is available.
	attempts := 1
	if w.notifRepo != nil && p.NotificationID != "" {
		if n, err := w.notifRepo.FindByID(p.NotificationID); err == nil {
			attempts = n.Attempts + 1
		}
	}

	// Resolve the SMS provider per-job so admin config changes take effect immediately.
	var provider services.SMSProvider
	if w.settingsSvc != nil {
		provider = w.settingsSvc.GetSMSProvider()
	} else {
		provider = &services.LogSMSProvider{}
	}
	sendErr := provider.Send(p.To, p.Body)

	// Persist status back to Notification row.
	if w.notifRepo != nil && p.NotificationID != "" {
		status := "sent"
		if sendErr != nil {
			status = "failed"
		}
		if uErr := w.notifRepo.UpdateStatus(p.NotificationID, status, attempts); uErr != nil {
			applogger.WarnContext(ctx, "failed to update notification status", "notification_id", p.NotificationID, "err", uErr)
		}
	}

	if sendErr != nil {
		return fmt.Errorf("SMS send via %s failed: %w", provider.Name(), sendErr)
	}
	applogger.InfoContext(ctx, "SMS sent successfully", "provider", provider.Name(), "to", services.MaskPhone(p.To))
	return nil
}

func (w *jobWorker) handleVisitorNotify(ctx context.Context, t *asynq.Task) error {
	var p VisitorNotifyPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("visitor:notify unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	applogger.InfoContext(ctx, "processing visitor notify", "ticket_id", p.TicketID, "type", p.Type)

	if w.notifService == nil || w.ticketRepo == nil {
		applogger.WarnContext(ctx, "visitor:notify: notifService or ticketRepo not wired, skipping")
		return nil
	}

	ticket, err := w.ticketRepo.FindByID(p.TicketID)
	if err != nil {
		return fmt.Errorf("visitor:notify: ticket not found %s: %w", p.TicketID, err)
	}

	switch p.Type {
	case "ticket_called":
		w.notifService.SendTicketCalledSMS(ticket)
	case "queue_position_alert":
		w.notifService.SendQueuePositionAlert(ticket)
	default:
		applogger.WarnContext(ctx, "visitor:notify: unknown type", "type", p.Type)
	}
	return nil
}

func (w *jobWorker) handleAnomalyCheck(ctx context.Context, _ *asynq.Task) error {
	if w.anomalySvc == nil {
		return nil
	}
	return w.anomalySvc.RunPeriodicCheck(ctx)
}
