package jobs

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"quokkaq-go-backend/internal/services"

	"github.com/hibiken/asynq"
)

type JobClient interface {
	EnqueueTtsGenerate(payload services.TtsJobPayload) error
	// EnqueueSMSSendRaw enqueues an sms:send job with a pre-formed payload struct.
	// Use the services.JobEnqueuer interface (with services.SMSSendJobPayload) at service layer.
	EnqueueSMSSendRaw(payload SMSSendPayload) error
	// EnqueueVisitorNotifyRaw enqueues a visitor:notify job with a pre-formed payload struct.
	EnqueueVisitorNotifyRaw(payload VisitorNotifyPayload) error
	EnqueueAnomalyCheck() error
	EnqueueSignageFeedPoll() error
	EnqueueWebhookFlushOutbox() error
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

func (c *jobClient) EnqueueSMSSendRaw(payload SMSSendPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	task := asynq.NewTask(TypeSMSSend, data)
	_, err = c.client.Enqueue(task, asynq.Queue("default"), asynq.MaxRetry(3))
	return err
}

func (c *jobClient) EnqueueVisitorNotifyRaw(payload VisitorNotifyPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	task := asynq.NewTask(TypeVisitorNotify, data)
	_, err = c.client.Enqueue(task, asynq.Queue("default"), asynq.MaxRetry(3))
	return err
}

func (c *jobClient) EnqueueAnomalyCheck() error {
	task := asynq.NewTask(TypeAnomalyCheck, []byte("{}"))
	_, err := c.client.Enqueue(task,
		asynq.Queue("low"),
		asynq.MaxRetry(1),
		asynq.Unique(10*time.Minute),
	)
	return err
}

func (c *jobClient) EnqueueSignageFeedPoll() error {
	task := asynq.NewTask(TypeSignageFeedPoll, []byte("{}"))
	_, err := c.client.Enqueue(task,
		asynq.Queue("low"),
		asynq.MaxRetry(1),
		asynq.Unique(50*time.Second),
	)
	return err
}

func (c *jobClient) EnqueueWebhookFlushOutbox() error {
	task := asynq.NewTask(TypeWebhookFlushOutbox, []byte("{}"))
	_, err := c.client.Enqueue(task,
		asynq.Queue("default"),
		asynq.MaxRetry(2),
		asynq.Unique(5*time.Second),
	)
	return err
}

func (c *jobClient) Close() error {
	return c.client.Close()
}
