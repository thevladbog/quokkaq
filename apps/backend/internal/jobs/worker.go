package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/services"

	"github.com/hibiken/asynq"
)

type JobWorker interface {
	Start()
	Stop()
}

type jobWorker struct {
	server     *asynq.Server
	mux        *asynq.ServeMux
	ttsService services.TtsService
	ticketRepo repository.TicketRepository
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

	return w
}

func (w *jobWorker) Start() {
	// Run() also registers SIGINT/SIGTERM and races with main's signal.Notify; Start() + Shutdown() from main avoids that.
	if err := w.server.Start(w.mux); err != nil {
		log.Fatalf("could not start asynq worker: %v", err)
	}
}

func (w *jobWorker) Stop() {
	w.server.Shutdown()
}

func (w *jobWorker) handleTtsGenerate(ctx context.Context, t *asynq.Task) error {
	var p services.TtsJobPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing TTS generation for ticket %s (Queue: %s, Counter: %s)", p.TicketID, p.QueueNumber, p.CounterName)

	text := fmt.Sprintf("Ticket number %s, please go to counter %s", p.QueueNumber, p.CounterName)
	url, err := w.ttsService.GenerateAndUpload(ctx, text, p.TicketID)
	if err != nil {
		return fmt.Errorf("failed to generate/upload TTS: %v", err)
	}

	log.Printf("TTS generated successfully: %s", url)

	// Update ticket with TTS URL
	ticket, err := w.ticketRepo.FindByID(p.TicketID)
	if err != nil {
		log.Printf("Warning: Failed to find ticket %s to update TTS URL: %v", p.TicketID, err)
		// Not returning error as TTS was generated successfully
		return nil
	}

	ticket.TTSUrl = &url
	if err := w.ticketRepo.Update(ticket); err != nil {
		log.Printf("Warning: Failed to update ticket %s with TTS URL: %v", p.TicketID, err)
		// Not returning error as TTS was generated successfully
	}

	return nil
}
