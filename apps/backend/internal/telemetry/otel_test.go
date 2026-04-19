package telemetry

import (
	"context"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

func TestTracerSamplerFromEnv(t *testing.T) {
	newParams := func(traceID trace.TraceID) sdktrace.SamplingParameters {
		t.Helper()
		return sdktrace.SamplingParameters{
			ParentContext: context.Background(),
			TraceID:       traceID,
			Name:          "test",
			Kind:          trace.SpanKindInternal,
		}
	}

	t.Run("always_on", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLER", "always_on")
		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "")
		s := tracerSamplerFromEnv()
		tid := mustTraceID(t, "0102030405060708090a0b0c0d0e0f10")
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("expected RecordAndSample")
		}
	})

	t.Run("always_off", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLER", "always_off")
		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "")
		s := tracerSamplerFromEnv()
		tid := mustTraceID(t, "0102030405060708090a0b0c0d0e0f10")
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.Drop {
			t.Fatalf("expected Drop")
		}
	})

	t.Run("empty_or_unknown_defaults_to_always_on_root", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLER", "")
		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "")
		s := tracerSamplerFromEnv()
		tid := mustTraceID(t, "0102030405060708090a0b0c0d0e0f10")
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("expected RecordAndSample for empty sampler name")
		}

		t.Setenv("OTEL_TRACES_SAMPLER", "not_a_real_sampler")
		s = tracerSamplerFromEnv()
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("expected RecordAndSample for unknown sampler name")
		}
	})

	t.Run("traceidratio_empty_arg_is_1", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLER", "traceidratio")
		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "")
		s := tracerSamplerFromEnv()
		tid := mustTraceID(t, "ffffffffffffffffffffffffffffffff")
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("expected ratio 1.0 to sample")
		}
	})

	t.Run("traceidratio_arg_clamped_and_parsed", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLER", "traceidratio")
		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "-1")
		s := tracerSamplerFromEnv()
		tid := mustTraceID(t, "0102030405060708090a0b0c0d0e0f10")
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.Drop {
			t.Fatalf("expected ratio 0 to drop")
		}

		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "2")
		s = tracerSamplerFromEnv()
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("expected ratio 1 to sample")
		}

		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "not-a-float")
		s = tracerSamplerFromEnv()
		if s.ShouldSample(newParams(tid)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("invalid arg should keep default ratio 1.0")
		}
	})

	t.Run("traceidratio_mid_ratio_is_deterministic", func(t *testing.T) {
		t.Setenv("OTEL_TRACES_SAMPLER", "traceidratio")
		t.Setenv("OTEL_TRACES_SAMPLER_ARG", "0.5")
		s := tracerSamplerFromEnv()

		// SDK: x := binary.BigEndian.Uint64(TraceID[8:16]) >> 1; sample when x < fraction * 2^63.
		low := mustTraceID(t, "00000000000000000000000000000001")
		high := mustTraceID(t, "0000000000000000ffffffffffffffff")

		if s.ShouldSample(newParams(low)).Decision != sdktrace.RecordAndSample {
			t.Fatalf("expected low trace ID to sample at ratio 0.5")
		}
		if s.ShouldSample(newParams(high)).Decision != sdktrace.Drop {
			t.Fatalf("expected high trace ID to drop at ratio 0.5")
		}
	})
}

func mustTraceID(t *testing.T, hex string) trace.TraceID {
	t.Helper()
	tid, err := trace.TraceIDFromHex(hex)
	if err != nil {
		t.Fatal(err)
	}
	return tid
}
