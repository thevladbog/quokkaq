package jobs

const (
	TypeTTSGenerate     = "tts:generate"
	TypeSMSSend         = "sms:send"
	TypeVisitorNotify   = "visitor:notify"
	TypeAnomalyCheck    = "anomaly:check"
	TypeSignageFeedPoll = "signage:feed_poll"
)

type TtsJobPayload struct {
	TicketID    string `json:"ticketId"`
	QueueNumber string `json:"queueNumber"`
	UnitID      string `json:"unitId"`
	CounterName string `json:"counterName,omitempty"`
}

// SMSSendPayload is the Asynq task payload for TypeSMSSend (wire format, JSON-serialised).
// Note: services.SMSSendJobPayload is the DTO used at the service layer to enqueue — values are
// mapped here at the jobs layer to keep the wire format stable.
type SMSSendPayload struct {
	NotificationID string `json:"notificationId"`
	To             string `json:"to"`
	Body           string `json:"body"`
	CompanyID      string `json:"companyId"`
	SmsSource      string `json:"smsSource"`
}

// VisitorNotifyPayload is the Asynq task payload for TypeVisitorNotify.
// The worker resolves the ticket, picks the correct notification method, and enqueues sms:send.
type VisitorNotifyPayload struct {
	TicketID string `json:"ticketId"`
	// Type identifies the notification event: "ticket_called" | "queue_position_alert".
	Type string `json:"type"`
}

// SignageFeedPollPayload is the Asynq task for TypeSignageFeedPoll (empty body; worker calls SignageService.PollDueFeeds).
type SignageFeedPollPayload struct{}
