import '../tracing';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { buildDependencies } from './composition-root';
import { logger } from '../shared/logging/logger';
import type { RecordData } from '../shared/types/records';
import { ProcessMercadoPagoWebhookUseCase } from '../modules/mercadopago/application/usecases/process-mercadopago-webhook-usecase';
import { env } from '../config/env';

const PREFETCH_COUNT = 10;

const startWorker = async () => {
  const dependencies = buildDependencies();
  logWorkerConfig(dependencies);
  await dependencies.mq.bootstrap();

  const channel = await dependencies.mq.connection.ensureChannel();
  if (!channel) {
    throw new Error('rabbitmq_channel_unavailable');
  }

  await channel.prefetch(PREFETCH_COUNT);

  const processor = new ProcessMercadoPagoWebhookUseCase(
    dependencies.clients.mercadopagoApiClient,
    dependencies.repositories.billingRepository
  );

  await channel.consume(
    dependencies.mq.config.processQueue,
    async (msg) => {
      if (!msg) return;
      await handleMessage(msg, dependencies, processor, channel);
    },
    { noAck: false }
  );

  logger.info(
    {
      queue: dependencies.mq.config.processQueue,
      prefetch: PREFETCH_COUNT
    },
    'mercadopago_worker_started'
  );
};

const handleMessage = async (
  msg: ConsumeMessage,
  dependencies: ReturnType<typeof buildDependencies>,
  processor: ProcessMercadoPagoWebhookUseCase,
  channel: ConfirmChannel
): Promise<void> => {
  const raw = msg.content.toString('utf8');
  const payload = parseJson(raw);

  if (!payload) {
    logger.error({ raw }, 'mercadopago_worker_invalid_json');
    await publishToDlq(
      dependencies,
      { error: 'invalid_json', raw },
      msg,
      0,
      'invalid_json'
    );
    channel.ack(msg);
    return;
  }

  logger.info(buildMessageSummary(msg, payload), 'mercadopago_worker_received');

  try {
    const result = await processor.execute(payload);
    logger.info(
      {
        status: result.status,
        reason: result.reason ?? null,
        payment_id: result.paymentId ?? null,
        payment_status: result.paymentStatus ?? null,
        user_id: result.userId ?? null,
        plan_code: result.planCode ?? null
      },
      'mercadopago_worker_processed'
    );
    channel.ack(msg);
  } catch (error) {
    logger.error(
      {
        err: error,
        ...buildMessageSummary(msg, payload)
      },
      'mercadopago_worker_processing_failed'
    );
    const attempts = resolveAttempts(msg, payload);
    const nextAttempt = attempts + 1;
    const shouldDlq = nextAttempt >= dependencies.mq.config.maxAttempts;
    const reason = error instanceof Error ? error.message : 'processing_failed';

    const retryPayload = {
      ...payload,
      attempts: nextAttempt,
      lastError: reason
    };

    if (shouldDlq) {
      const published = await publishToDlq(
        dependencies,
        retryPayload,
        msg,
        nextAttempt,
        reason
      );
      if (published) {
        channel.ack(msg);
      } else {
        channel.nack(msg, false, true);
      }
      return;
    }

    const published = await publishToRetry(
      dependencies,
      retryPayload,
      msg,
      nextAttempt,
      reason
    );

    if (published) {
      channel.ack(msg);
    } else {
      channel.nack(msg, false, true);
    }
  }
};

const publishToRetry = async (
  dependencies: ReturnType<typeof buildDependencies>,
  payload: RecordData,
  msg: ConsumeMessage,
  attempts: number,
  reason: string
): Promise<boolean> => {
  const retryQueue = resolveRetryQueue(dependencies.mq.config.retryQueues, attempts);
  if (!retryQueue) {
    return publishToDlq(dependencies, payload, msg, attempts, 'retry_queue_unavailable');
  }

  const result = await dependencies.mq.publisher.publish({
    exchange: dependencies.mq.config.dlx,
    routingKey: retryQueue.routingKey,
    payload,
    correlationId: resolveCorrelationId(msg, payload),
    messageId: resolveMessageId(msg, payload),
    headers: buildHeaders(msg, attempts, reason)
  });

  if (!result.published) {
    logger.error(
      {
        error: result.error ?? 'retry_publish_failed',
        attempts,
        routing_key: retryQueue.routingKey
      },
      'mercadopago_worker_retry_failed'
    );
    return false;
  }

  logger.warn(
    {
      attempts,
      delay_ms: retryQueue.ttlMs,
      routing_key: retryQueue.routingKey
    },
    'mercadopago_worker_retry_scheduled'
  );
  return true;
};

const publishToDlq = async (
  dependencies: ReturnType<typeof buildDependencies>,
  payload: RecordData,
  msg: ConsumeMessage,
  attempts: number,
  reason: string
): Promise<boolean> => {
  const result = await dependencies.mq.publisher.publish({
    exchange: dependencies.mq.config.dlx,
    routingKey: dependencies.mq.config.dlqRoutingKey,
    payload,
    correlationId: resolveCorrelationId(msg, payload),
    messageId: resolveMessageId(msg, payload),
    headers: buildHeaders(msg, attempts, reason)
  });

  if (!result.published) {
    logger.error(
      { error: result.error ?? 'dlq_publish_failed', attempts },
      'mercadopago_worker_dlq_failed'
    );
    return false;
  }

  logger.warn({ attempts }, 'mercadopago_worker_sent_to_dlq');
  return true;
};

const resolveRetryQueue = (
  retryQueues: { ttlMs: number; routingKey: string }[],
  attempts: number
): { ttlMs: number; routingKey: string } | null => {
  if (retryQueues.length === 0) return null;
  const index = Math.min(Math.max(attempts - 1, 0), retryQueues.length - 1);
  return retryQueues[index] ?? null;
};

const resolveAttempts = (msg: ConsumeMessage, payload: RecordData): number => {
  const headerValue = resolveHeaderNumber(msg.properties.headers, 'x-attempts');
  if (headerValue !== null) return headerValue;

  const payloadAttempts = payload.attempts;
  if (typeof payloadAttempts === 'number' && Number.isFinite(payloadAttempts)) {
    return payloadAttempts;
  }
  if (typeof payloadAttempts === 'string') {
    const parsed = Number(payloadAttempts);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
};

const resolveHeaderNumber = (
  headers: ConsumeMessage['properties']['headers'],
  key: string
): number | null => {
  if (!headers) return null;
  const value = headers[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveCorrelationId = (msg: ConsumeMessage, payload: RecordData): string | undefined => {
  return msg.properties.correlationId ?? (payload.requestId as string | undefined);
};

const resolveMessageId = (msg: ConsumeMessage, payload: RecordData): string | undefined => {
  return msg.properties.messageId ?? (payload.eventId as string | undefined);
};

const logWorkerConfig = (dependencies: ReturnType<typeof buildDependencies>): void => {
  const dbInfo = parseUrlInfo(env.DATABASE_URL);
  const supabaseInfo = parseUrlInfo(env.SUPABASE_URL);
  const mqInfo = parseUrlInfo(env.RABBITMQ_URL);

  logger.info(
    {
      db_adapter: env.DATABASE_URL ? 'pg' : 'supabase',
      db_host: dbInfo?.host ?? null,
      db_port: dbInfo?.port ?? null,
      db_name: dbInfo?.database ?? null,
      supabase_host: supabaseInfo?.host ?? null,
      mq_host: mqInfo?.host ?? null,
      mq_port: mqInfo?.port ?? null,
      mq_exchange: dependencies.mq.config.exchange,
      mq_dlx: dependencies.mq.config.dlx,
      mq_queue_process: dependencies.mq.config.processQueue,
      mq_queue_dlq: dependencies.mq.config.dlqQueue,
      mq_max_attempts: dependencies.mq.config.maxAttempts
    },
    'mercadopago_worker_config'
  );
};

const parseUrlInfo = (
  value?: string | null
): { host: string; port: number | null; database: string | null } | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const database = url.pathname ? url.pathname.replace(/^\/+/, '') : null;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : null,
      database: database && database.length > 0 ? database : null
    };
  } catch {
    return null;
  }
};

const buildMessageSummary = (msg: ConsumeMessage, payload: RecordData): RecordData => {
  const headers = msg.properties.headers ?? {};
  return {
    routing_key: msg.fields.routingKey,
    message_id: msg.properties.messageId ?? null,
    correlation_id: msg.properties.correlationId ?? null,
    attempts: resolveHeaderNumber(headers, 'x-attempts') ?? resolvePayloadAttempts(payload),
    event_id: asString(payload.eventId) ?? asString(payload.id) ?? null,
    topic: asString(payload.topic) ?? asString(payload.type) ?? null,
    action: asString(payload.action) ?? null,
    payload_id: asString(payload.id) ?? null,
    payload_data_id: asString(getNested(payload, ['data', 'id'])) ?? null,
    payload_resource: asString(payload.resource) ?? null
  };
};

const resolvePayloadAttempts = (payload: RecordData): number => {
  const payloadAttempts = payload.attempts;
  if (typeof payloadAttempts === 'number' && Number.isFinite(payloadAttempts)) {
    return payloadAttempts;
  }
  if (typeof payloadAttempts === 'string') {
    const parsed = Number(payloadAttempts);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const getNested = (value: RecordData, path: string[]): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as RecordData)[key];
  }
  return current ?? null;
};

const asString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const buildHeaders = (
  msg: ConsumeMessage,
  attempts: number,
  reason: string
): Record<string, unknown> => {
  return {
    ...(msg.properties.headers ?? {}),
    'x-attempts': attempts,
    'x-error': reason,
    'x-original-routing-key': msg.fields.routingKey
  };
};

const parseJson = (value: string): RecordData | null => {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed as RecordData;
    }
    return null;
  } catch {
    return null;
  }
};

void startWorker().catch((error) => {
  logger.error({ err: error }, 'mercadopago_worker_failed');
  process.exit(1);
});
