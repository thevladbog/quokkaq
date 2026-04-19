import type { Attributes } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  WebTracerProvider
} from '@opentelemetry/sdk-trace-web';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';

let initOnce = false;

/** Strip query strings from URL-like attribute values (basic PII hygiene). */
function scrubAttributes(attrs: Attributes): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'string' && v.includes('?')) {
      const q = v.indexOf('?');
      out[k] = v.slice(0, q);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scrubSpan(span: ReadableSpan): ReadableSpan {
  return {
    name: span.name,
    kind: span.kind,
    spanContext: span.spanContext,
    parentSpanContext: span.parentSpanContext,
    startTime: span.startTime,
    endTime: span.endTime,
    status: span.status,
    attributes: scrubAttributes(span.attributes),
    links: span.links,
    events: span.events,
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount
  };
}

class ScrubbingSpanExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.delegate.export(spans.map(scrubSpan), resultCallback);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}

function parseSamplerRatio(): number {
  const raw = process.env.NEXT_PUBLIC_OTEL_TRACES_SAMPLER_RATIO?.trim();
  if (raw === undefined || raw === '') {
    return process.env.NODE_ENV === 'production' ? 0.1 : 1;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 0.1;
  }
  return Math.min(1, Math.max(0, n));
}

function resolveOtlpExporterUrl(): string {
  const direct = process.env.NEXT_PUBLIC_OTEL_EXPORTER_URL?.trim();
  if (direct) {
    return new URL(direct, window.location.href).href;
  }
  return new URL('/api/telemetry/traces', window.location.origin).href;
}

function buildExporterHeaders(): Record<string, string> | undefined {
  const key = process.env.NEXT_PUBLIC_OTEL_BROWSER_INGEST_KEY?.trim();
  if (!key) {
    return undefined;
  }
  return { 'x-otel-ingest-key': key };
}

/**
 * Initializes browser OpenTelemetry (fetch + optional document-load), OTLP export, W3C propagation.
 * Call once from the client; guarded by {@link initOnce}.
 */
export function initOtelBrowser(): void {
  if (initOnce) {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  if (process.env.NEXT_PUBLIC_OTEL_ENABLED !== 'true') {
    return;
  }
  initOnce = true;

  const serviceName =
    process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME?.trim() || 'quokkaq-web';
  const serviceVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || '0.0.0';
  const envName =
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': envName
  });

  const exporterUrl = resolveOtlpExporterUrl();
  const baseExporter = new OTLPTraceExporter({
    url: exporterUrl,
    headers: buildExporterHeaders()
  });
  const exporter = new ScrubbingSpanExporter(baseExporter);

  const ratio = parseSamplerRatio();
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio)
  });

  const provider = new WebTracerProvider({
    resource,
    sampler,
    spanProcessors: [new BatchSpanProcessor(exporter)]
  });

  const ignoreTelemetryExport: RegExp[] = [
    /\/api\/telemetry\/traces(\?|$)/,
    /\/v1\/traces(\?|$)/
  ];

  const instrumentations: Instrumentation[] = [
    new FetchInstrumentation({
      ignoreUrls: ignoreTelemetryExport,
      clearTimingResources: true
    })
  ];

  if (process.env.NEXT_PUBLIC_OTEL_DOCUMENT_LOAD === 'true') {
    instrumentations.push(new DocumentLoadInstrumentation());
  }

  registerInstrumentations({
    instrumentations,
    tracerProvider: provider
  });

  provider.register();
}
