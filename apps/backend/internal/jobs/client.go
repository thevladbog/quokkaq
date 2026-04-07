package jobs

import (
	"encoding/json"
	"fmt"
	"os"

	"quokkaq-go-backend/internal/services"

	"github.com/hibiken/asynq"
)

type JobClient interface {
	EnqueueTtsGenerate(payload services.TtsJobPayload) error
	Close() error
}

type jobClient struct {
	client *asynq.Client
}

func NewJobClient() JobClient {
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

	client := asynq.NewClient(asynq.RedisClientOpt{
		Addr:     redisAddr,
		Password: redisPassword,
	})
	return &jobClient{client: client}
}

func (c *jobClient) EnqueueTtsGenerate(payload services.TtsJobPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	task := asynq.NewTask(TypeTTSGenerate, data)
	_, err = c.client.Enqueue(task, asynq.Queue("default"), asynq.MaxRetry(3))
	return err
}

func (c *jobClient) Close() error {
	return c.client.Close()
}
