package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

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
}

func NewJobWorker(ttsService services.TtsService) JobWorker {
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
	}

	mux.HandleFunc(TypeTTSGenerate, w.handleTtsGenerate)

	return w
}

func (w *jobWorker) Start() {
	go func() {
		if err := w.server.Run(w.mux); err != nil {
			log.Fatalf("could not run server: %v", err)
		}
	}()
}

func (w *jobWorker) Stop() {
	w.server.Stop()
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

	// TODO: Update ticket with TTS URL if needed (requires TicketService or Repository access)

	return nil
}
