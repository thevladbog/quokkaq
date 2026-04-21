package services

import "log/slog"

// LogSMSProvider is a no-op SMS provider that logs messages to stdout.
// Used in development/test environments and when no provider is configured.
type LogSMSProvider struct{}

func (p *LogSMSProvider) Name() string { return "log" }

func (p *LogSMSProvider) Send(to, body string) error {
	slog.Debug("SMS (log provider — not sent)", "to", MaskPhone(to), "body_len", len(body))
	return nil
}
