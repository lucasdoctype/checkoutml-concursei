/* eslint-disable @typescript-eslint/no-var-requires */

try {
  require('dotenv').config();
} catch {}

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const enabledFlag = String(process.env.OTEL_ENABLED ?? '') !== '0';
const endpointRaw = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME || 'concursei-webhook-payment';

const resolveEndpoint = () => {
  if (!endpointRaw) return null;
  try {
    // eslint-disable-next-line no-new
    new URL(endpointRaw);
    return endpointRaw;
  } catch {
    return null;
  }
};

const endpoint = resolveEndpoint();
const shouldEnable = enabledFlag && !!endpoint;

if (!shouldEnable) {
  if (enabledFlag && endpointRaw && !endpoint) {
    // eslint-disable-next-line no-console
    console.warn(`[otel] OTEL_EXPORTER_OTLP_TRACES_ENDPOINT invalid (${String(endpointRaw)}); tracing disabled.`);
  }
} else {
  const exporter = new OTLPTraceExporter({ url: endpoint! });

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()]
  });

  void Promise.resolve(sdk.start()).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[otel] Failed to initialize tracing. Continuing without tracing.', error);
  });

  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}
