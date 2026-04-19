package handlers

import (
	"fmt"
	"log/slog"
	"net/http"

	"quokkaq-go-backend/internal/services"
)

// writeSupportReportUpstreamHTTPError logs err, maps upstream HTTP 503 to 503, and other
// TicketIntegrationHTTPStatus errors to 502 with clientMsg502.
func writeSupportReportUpstreamHTTPError(w http.ResponseWriter, err error, logMsg string, clientMsg502 string) {
	slog.Error(fmt.Sprintf(logMsg, err))
	if st, ok := services.TicketIntegrationHTTPStatus(err); ok && st == http.StatusServiceUnavailable {
		http.Error(w, "External ticketing service is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	http.Error(w, clientMsg502, http.StatusBadGateway)
}
