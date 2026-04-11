package main

import (
	"context"
	"net/http"
	"quokkaq-go-backend/pkg/database"
	"time"
)

// healthLive godoc
// @Summary      Liveness probe
// @Description  Returns 200 if the HTTP server accepts requests. Does not check databases or Redis.
// @Tags         health
// @Produce      json
// @Success      200 {object} map[string]string
// @Router       /health/live [get]
// @Router       /health/live [head]
func healthLive(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(`{"status":"up"}`))
	}
}

// healthReady godoc
// @Summary      Readiness probe
// @Description  Returns 200 if PostgreSQL is reachable via the connection pool; otherwise 503.
// @Tags         health
// @Produce      json
// @Success      200 {object} map[string]string
// @Failure      503 {object} map[string]string
// @Router       /health/ready [get]
// @Router       /health/ready [head]
func healthReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	w.Header().Set("Content-Type", "application/json")
	if err := database.Ping(ctx); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		if r.Method != http.MethodHead {
			_, _ = w.Write([]byte(`{"status":"not ready"}`))
		}
		return
	}
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	}
}
