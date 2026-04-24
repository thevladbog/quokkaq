package services

// JobEnqueuer is an interface for enqueuing background jobs.
// Defined here (not in the jobs package) to avoid circular import:
// services → jobs → services.
type JobEnqueuer interface {
	EnqueueTtsGenerate(payload TtsJobPayload) error
	EnqueueSMSSend(payload SMSSendJobPayload) error
	EnqueueVisitorNotify(payload VisitorNotifyJobPayload) error
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
	CompanyID      string // for tenant SMS; empty = platform only
	SmsSource      string // "tenant" | "platform" | "log" — as resolved at enqueue time
}

// VisitorNotifyJobPayload is the services-layer DTO for enqueuing a visitor:notify job.
type VisitorNotifyJobPayload struct {
	TicketID string
	// Type is the notification event: "ticket_called" | "queue_position_alert".
	Type string
}
