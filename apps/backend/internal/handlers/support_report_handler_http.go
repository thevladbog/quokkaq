package handlers

import (
	"context"
	"net/http"

	"quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/services"
)

// writeSupportReportUpstreamHTTPError logs err, maps upstream HTTP 503 to 503, and other
// TicketIntegrationHTTPStatus errors to 502 with clientMsg502.
func writeSupportReportUpstreamHTTPError(ctx context.Context, w http.ResponseWriter, err error, logMsg string, clientMsg502 string) {
	logger.ErrorfCtx(ctx, logMsg, err)
	if st, ok := services.TicketIntegrationHTTPStatus(err); ok && st == http.StatusServiceUnavailable {
		http.Error(w, "External ticketing service is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	http.Error(w, clientMsg502, http.StatusBadGateway)
}
