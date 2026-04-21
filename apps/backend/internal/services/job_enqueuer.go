package services

// JobEnqueuer is an interface for enqueuing background jobs.
// Defined here (not in the jobs package) to avoid circular import:
// services → jobs → services.
type JobEnqueuer interface {
	EnqueueTtsGenerate(payload TtsJobPayload) error
	EnqueueSMSSend(payload SMSSendJobPayload) error
}

// TtsJobPayload represents the data needed for a TTS generation job.
type TtsJobPayload struct {
	TicketID    string
	QueueNumber string
	UnitID      string
	CounterName string
}

// SMSSendJobPayload is the services-layer DTO for enqueuing an sms:send job.
type SMSSendJobPayload struct {
	NotificationID string
	To             string
	Body           string
}
