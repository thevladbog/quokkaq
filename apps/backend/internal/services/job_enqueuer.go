package services

// JobEnqueuer is an interface for enqueuing background jobs
// This avoids circular dependency with the jobs package
type JobEnqueuer interface {
	EnqueueTtsGenerate(payload TtsJobPayload) error
}

// TtsJobPayload represents the data needed for a TTS generation job
type TtsJobPayload struct {
	TicketID    string
	QueueNumber string
	UnitID      string
	CounterName string
}
