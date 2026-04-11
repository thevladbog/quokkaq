package main

import (
	"context"
	"log"
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
func healthLive(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"up"}`))
}

// healthLiveHead godoc
// @Summary      Liveness probe (HEAD)
// @Description  Same as GET /health/live without a response body.
// @Tags         health
// @Router       /health/live [head]
func healthLiveHead(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// healthReady godoc
// @Summary      Readiness probe
// @Description  Returns 200 if PostgreSQL is reachable via the connection pool; otherwise 503.
// @Tags         health
// @Produce      json
// @Success      200 {object} map[string]string
// @Failure      503 {object} map[string]string
// @Router       /health/ready [get]
func healthReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	w.Header().Set("Content-Type", "application/json")
	if err := database.Ping(ctx); err != nil {
		log.Printf("/health/ready: database ping failed: %v (%s %s)", err, r.Method, r.RemoteAddr)
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"status":"not ready"}`))
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ready"}`))
}

// healthReadyHead godoc
// @Summary      Readiness probe (HEAD)
// @Description  Same checks as GET /health/ready without a response body.
// @Tags         health
// @Failure      503  "Database unreachable"
// @Router       /health/ready [head]
func healthReadyHead(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := database.Ping(ctx); err != nil {
		log.Printf("/health/ready: database ping failed: %v (%s %s)", err, r.Method, r.RemoteAddr)
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
}
