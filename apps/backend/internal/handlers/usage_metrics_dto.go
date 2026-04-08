package handlers

import (
	"time"

	"quokkaq-go-backend/internal/services"
)

// UsageMetricsResponse is the public API shape for usage metrics (decoupled from services package for OpenAPI).
type UsageMetricsResponse struct {
	CurrentPeriod PeriodResponse                      `json:"currentPeriod"`
	Metrics       map[string]UsageMetricInfoResponse `json:"metrics"`
}

// PeriodResponse is the billing period window returned to clients.
type PeriodResponse struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// UsageMetricInfoResponse is current usage vs plan limit for one metric.
type UsageMetricInfoResponse struct {
	Current int `json:"current"`
	Limit   int `json:"limit"`
}

func usageMetricsToResponse(m *services.UsageMetrics) UsageMetricsResponse {
	if m == nil {
		return UsageMetricsResponse{Metrics: map[string]UsageMetricInfoResponse{}}
	}
	out := UsageMetricsResponse{
		CurrentPeriod: PeriodResponse{
			Start: m.CurrentPeriod.Start,
			End:   m.CurrentPeriod.End,
		},
		Metrics: make(map[string]UsageMetricInfoResponse, len(m.Metrics)),
	}
	for k, v := range m.Metrics {
		out.Metrics[k] = UsageMetricInfoResponse{Current: v.Current, Limit: v.Limit}
	}
	return out
}
