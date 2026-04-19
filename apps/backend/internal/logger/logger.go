// Package logger configures the process-wide slog logger (JSON in production-like
// environments, tinted text in development) and enriches records with Chi request IDs.
package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/lmittmann/tint"
)

// Init configures slog.Default from LOG_LEVEL, LOG_FORMAT, and APP_ENV.
// Call after config.Load() so .env values are visible.
func Init() {
	level := parseLevel(os.Getenv("LOG_LEVEL"))
	format := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT")))
	if format == "" {
		if isProdLikeEnv() {
			format = "json"
		} else {
			format = "text"
		}
	}
	slog.SetDefault(slog.New(buildHandler(os.Stdout, format, level)))
}

// InitWriter is like Init but writes to w (e.g. tests).
func InitWriter(w io.Writer, format string, level slog.Level) {
	format = strings.ToLower(strings.TrimSpace(format))
	slog.SetDefault(slog.New(buildHandler(w, format, level)))
}

func buildHandler(w io.Writer, format string, level slog.Level) slog.Handler {
	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler
	switch format {
	case "json":
		h = slog.NewJSONHandler(w, opts)
	default:
		h = tint.NewHandler(w, &tint.Options{Level: level})
	}
	return &reqIDHandler{inner: h}
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func isProdLikeEnv() bool {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return appEnv == "production" || appEnv == "staging"
}

type reqIDHandler struct {
	inner slog.Handler
}

func (h *reqIDHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *reqIDHandler) Handle(ctx context.Context, r slog.Record) error {
	if id := middleware.GetReqID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.inner.Handle(ctx, r)
}

func (h *reqIDHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &reqIDHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *reqIDHandler) WithGroup(name string) slog.Handler {
	return &reqIDHandler{inner: h.inner.WithGroup(name)}
}

// InfoContext logs at info level with context (structured key/value args). Uses slog.Default (Chi request_id when ctx carries it).
func InfoContext(ctx context.Context, msg string, args ...any) {
	slog.InfoContext(ctx, msg, args...)
}

// WarnContext logs at warn level with context (structured key/value args).
func WarnContext(ctx context.Context, msg string, args ...any) {
	slog.WarnContext(ctx, msg, args...)
}

// Error logs at error level (structured key/value args).
func Error(msg string, args ...any) {
	slog.Error(msg, args...)
}

// Errorf logs fmt.Sprintf(format, args...) at error level (no request context).
func Errorf(format string, args ...any) {
	slog.Error(fmt.Sprintf(format, args...))
}

// Debugf logs a line built with fmt.Sprintf at debug level.
func Debugf(format string, args ...any) {
	slog.Debug(fmt.Sprintf(format, args...))
}

// Printf logs a line built with fmt.Sprintf at info level. Prefer PrintfCtx from HTTP handlers so request_id is attached.
func Printf(format string, args ...any) {
	slog.Info(fmt.Sprintf(format, args...))
}

// PrintfCtx is like Printf but attaches Chi request_id when ctx carries it.
func PrintfCtx(ctx context.Context, format string, args ...any) {
	slog.InfoContext(ctx, fmt.Sprintf(format, args...))
}

// ErrorfCtx logs a line built with fmt.Sprintf at error level. Prefer from HTTP handlers so request_id is attached.
func ErrorfCtx(ctx context.Context, format string, args ...any) {
	slog.ErrorContext(ctx, fmt.Sprintf(format, args...))
}

// Println logs fmt.Sprint(args...) at info level.
func Println(args ...any) {
	slog.Info(fmt.Sprint(args...))
}
