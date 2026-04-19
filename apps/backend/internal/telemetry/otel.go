// Package telemetry configures OpenTelemetry tracing (OTLP export when configured, W3C propagation always).
package telemetry

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
	"go.opentelemetry.io/otel/trace/noop"
)

func tracerSamplerFromEnv() sdktrace.Sampler {
	name := strings.ToLower(strings.TrimSpace(os.Getenv("OTEL_TRACES_SAMPLER")))
	arg := strings.TrimSpace(os.Getenv("OTEL_TRACES_SAMPLER_ARG"))

	var root sdktrace.Sampler
	switch name {
	case "always_off":
		root = sdktrace.NeverSample()
	case "always_on":
		root = sdktrace.AlwaysSample()
	case "traceidratio":
		ratio := 1.0
		if arg != "" {
			if r, err := strconv.ParseFloat(arg, 64); err == nil {
				if r < 0 {
					r = 0
				} else if r > 1 {
					r = 1
				}
				ratio = r
			}
		}
		root = sdktrace.TraceIDRatioBased(ratio)
	default:
		// Unset or unknown: sample everything (matches prior implicit behavior).
		root = sdktrace.AlwaysSample()
	}

	return sdktrace.ParentBased(root)
}

// Setup configures the global TracerProvider and W3C TraceContext/Baggage propagators.
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset, uses a noop tracer (no export) but still propagates incoming traceparent.
// Returns a shutdown function to flush/export spans (safe to call with noop).
func Setup(ctx context.Context) (func(context.Context) error, error) {
	prop := propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	)
	otel.SetTextMapPropagator(prop)

	endpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if endpoint == "" {
		otel.SetTracerProvider(noop.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("parse OTEL_EXPORTER_OTLP_ENDPOINT: %w", err)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT must include host (e.g. http://localhost:4318)")
	}

	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(u.Host),
	}
	if u.Scheme == "http" {
		opts = append(opts, otlptracehttp.WithInsecure())
	}

	exporter, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("otlp trace exporter: %w", err)
	}

	serviceName := strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME"))
	if serviceName == "" {
		serviceName = "quokkaq-api"
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(semconv.SchemaURL,
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(tracerSamplerFromEnv()),
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	return func(shutdownCtx context.Context) error {
		ctx, cancel := context.WithTimeout(shutdownCtx, 10*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctx); err != nil {
			return fmt.Errorf("tracer provider shutdown: %w", err)
		}
		return nil
	}, nil
}
