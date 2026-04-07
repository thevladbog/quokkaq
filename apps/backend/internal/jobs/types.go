package jobs

const (
	TypeTTSGenerate = "tts:generate"
)

type TtsJobPayload struct {
	TicketID    string `json:"ticketId"`
	QueueNumber string `json:"queueNumber"`
	UnitID      string `json:"unitId"`
	CounterName string `json:"counterName,omitempty"`
}
