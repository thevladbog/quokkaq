package telemetry

import (
	"context"
	"crypto/tls"
	"log"
	"os"
	"strings"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.34.0"
	"go.opentelemetry.io/otel/trace/noop"
	"google.golang.org/grpc/credentials"
)

const defaultServiceName = "quokkaq-api"

var (
	mu       sync.Mutex
	tracerTP *sdktrace.TracerProvider
)

func setGlobals(tp *sdktrace.TracerProvider) {
	mu.Lock()
	defer mu.Unlock()
	tracerTP = tp
}

func currentTP() *sdktrace.TracerProvider {
	mu.Lock()
	defer mu.Unlock()
	return tracerTP
}

// Init configures OpenTelemetry tracing. When OTLP is not configured, a noop
// tracer provider is installed so the rest of the app can ignore telemetry.
func Init(ctx context.Context) error {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	if !otlpEnabled() {
		otel.SetTracerProvider(noop.NewTracerProvider())
		return nil
	}

	base, err := resource.New(ctx,
		resource.WithAttributes(semconv.ServiceName(defaultServiceName)),
		resource.WithTelemetrySDK(),
		resource.WithHost(),
	)
	if err != nil {
		log.Printf("telemetry: default resource: %v", err)
		base, _ = resource.New(ctx, resource.WithAttributes(semconv.ServiceName(defaultServiceName)))
	}

	envRes, err := resource.New(ctx, resource.WithFromEnv())
	if err != nil {
		log.Printf("telemetry: env resource: %v", err)
		envRes = resource.Empty()
	}

	res, err := resource.Merge(base, envRes)
	if err != nil {
		return err
	}

	exporter, err := otlptracegrpc.New(ctx, exporterOpts()...)
	if err != nil {
		otel.SetTracerProvider(noop.NewTracerProvider())
		return err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	setGlobals(tp)
	return nil
}

// Shutdown flushes and shuts down the tracer provider when OTLP was enabled.
func Shutdown(ctx context.Context) error {
	tp := currentTP()
	if tp == nil {
		return nil
	}
	err := tp.Shutdown(ctx)
	setGlobals(nil)
	return err
}

func otlpEnabled() bool {
	if envTruthy(os.Getenv("OTEL_SDK_DISABLED")) {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("OTEL_TRACES_EXPORTER"))) {
	case "none":
		return false
	}
	e := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"))
	if e == "" {
		e = strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	}
	return e != ""
}

func envTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// exporterOpts adds TLS overrides not covered by env alone. When the OTLP URL
// uses https:// but the server uses a private CA, prefer
// OTEL_EXPORTER_OTLP_CERTIFICATE (or TRACES_CERTIFICATE) pointing at the CA PEM.
func exporterOpts() []otlptracegrpc.Option {
	if !envTruthy(os.Getenv("OTEL_EXPORTER_OTLP_TLS_INSECURE_SKIP_VERIFY")) {
		return nil
	}
	//nolint:gosec // G402: explicit dev-only escape hatch; do not set in production.
	tlsCfg := &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12}
	return []otlptracegrpc.Option{
		otlptracegrpc.WithTLSCredentials(credentials.NewTLS(tlsCfg)),
	}
}
