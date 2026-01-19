import { logger } from '../../../../shared/logging/logger';
import type { MessagePublisher } from '../../../../shared/mq/message-publisher';
import type { RecordData } from '../../../../shared/types/records';
import type { MercadoPagoWebhookRepository } from '../ports/MercadoPagoWebhookRepository';
import { buildWebhookMessage, buildWebhookRoutingKey } from './mercadopago-webhook-message';

export interface RepublishFailedSummary {
  processed: number;
  succeeded: number;
  failed: number;
  sentToDlq: number;
}

interface RepublishOptions {
  exchange: string;
  dlx: string;
  dlqRoutingKey: string;
  maxAttempts: number;
  batchSize?: number;
}

export class RepublishFailedWebhooksUseCase {
  private readonly batchSize: number;

  constructor(
    private readonly webhookRepository: MercadoPagoWebhookRepository,
    private readonly publisher: MessagePublisher,
    private readonly options: RepublishOptions
  ) {
    this.batchSize = options.batchSize ?? 1000;
  }

  async execute(): Promise<RepublishFailedSummary> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let sentToDlq = 0;

    const events = await this.webhookRepository.listFailed(this.batchSize);

    for (const event of events) {
      processed += 1;
      const eventId = String(event.mercadopago_event_id ?? '');
      const attempts = Number(event.process_attempts ?? 0);
      const requestId = extractRequestId(event.headers_raw);

      if (attempts >= this.options.maxAttempts) {
        const payload = buildPayload(event, requestId, attempts);
        const dlqResult = await this.publisher.publish({
          exchange: this.options.dlx,
          routingKey: this.options.dlqRoutingKey,
          payload,
          correlationId: requestId,
          messageId: eventId || undefined
        });

        sentToDlq += dlqResult.published ? 1 : 0;
        if (!dlqResult.published) {
          failed += 1;
          logger.error(
            { event_id: eventId, error: dlqResult.error ?? 'dlq_publish_failed' },
            'mercadopago_webhook_dlq_failed'
          );
          continue;
        }

        await this.webhookRepository.updateStatusByEventId(eventId, {
          status: 'FAILED',
          lastError: 'max_attempts_reached'
        });

        logger.warn(
          { event_id: eventId, attempts, request_id: requestId ?? null },
          'mercadopago_webhook_sent_to_dlq'
        );
        continue;
      }

      const routingKey = buildWebhookRoutingKey(
        asNullableString(event.topic),
        asNullableString(event.action)
      );
      const payload = buildPayload(event, requestId, attempts);

      const publishResult = await this.publisher.publish({
        exchange: this.options.exchange,
        routingKey,
        payload,
        correlationId: requestId,
        messageId: eventId || undefined
      });

      if (publishResult.published) {
        succeeded += 1;
        await this.webhookRepository.updateStatusByEventId(eventId, {
          status: 'PROCESSED',
          lastError: null
        });
        logger.info(
          { event_id: eventId, request_id: requestId ?? null, routing_key: routingKey },
          'mercadopago_webhook_republished'
        );
      } else {
        failed += 1;
        const sanitized = sanitizeError(publishResult.error);
        await this.webhookRepository.updateStatusByEventId(eventId, {
          status: 'FAILED',
          lastError: sanitized,
          incrementAttempts: true
        });
        logger.error(
          { event_id: eventId, request_id: requestId ?? null, error: sanitized },
          'mercadopago_webhook_republish_failed'
        );
      }
    }

    return { processed, succeeded, failed, sentToDlq };
  }
}

const buildPayload = (event: RecordData, requestId: string | null, attempts: number): RecordData => {
  const eventId = String(event.mercadopago_event_id ?? '');
  const topic = asNullableString(event.topic);
  const action = asNullableString(event.action);
  const createdAt = asNullableString(event.created_at_mp);
  const liveMode = Boolean(event.live_mode);
  const payload = event.payload_raw && typeof event.payload_raw === 'object' ? (event.payload_raw as RecordData) : {};
  const headers = event.headers_raw && typeof event.headers_raw === 'object' ? (event.headers_raw as RecordData) : {};

  return {
    ...buildWebhookMessage({
      eventId,
      topic,
      action,
      createdAtMp: createdAt,
      liveMode,
      payload,
      headers,
      requestId: requestId ?? undefined
    }),
    attempts
  };
};

const asNullableString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const extractRequestId = (headers: unknown): string | null => {
  if (!headers || typeof headers !== 'object') return null;
  const record = headers as RecordData;
  const candidate = record['x-request-id'] ?? record['x-correlation-id'];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
};

const sanitizeError = (value?: string): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
};
