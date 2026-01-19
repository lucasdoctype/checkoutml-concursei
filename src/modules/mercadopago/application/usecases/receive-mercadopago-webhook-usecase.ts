import { AppError, ValidationError } from '../../../../shared/errors/app-error';
import type { RecordData } from '../../../../shared/types/records';
import type { MessagePublisher } from '../../../../shared/mq/message-publisher';
import { logger } from '../../../../shared/logging/logger';
import type { MercadoPagoWebhookRepository } from '../ports/MercadoPagoWebhookRepository';
import { extractWebhookMetadata } from '../../domain/mercadopago-webhook';
import { buildWebhookMessage, buildWebhookRoutingKey } from './mercadopago-webhook-message';

export interface ReceiveMercadoPagoWebhookInput {
  payload: RecordData;
  headers: RecordData;
  requestId?: string;
}

export interface ReceiveMercadoPagoWebhookOutput {
  event: RecordData;
  created: boolean;
  published: boolean;
  status: string;
}

export class ReceiveMercadoPagoWebhookUseCase {
  constructor(
    private readonly webhookRepository: MercadoPagoWebhookRepository,
    private readonly publisher: MessagePublisher,
    private readonly exchange: string
  ) {}

  async execute(input: ReceiveMercadoPagoWebhookInput): Promise<ReceiveMercadoPagoWebhookOutput> {
    const metadata = extractWebhookMetadata(input.payload);

    if (!metadata.eventId) {
      throw new ValidationError('missing_event_id');
    }

    const existing = await this.webhookRepository.findByEventId(metadata.eventId);
    if (existing) {
      logger.info(
        { event_id: metadata.eventId, request_id: input.requestId ?? null },
        'mercadopago_webhook_duplicate_ignored'
      );
      return {
        event: existing,
        created: false,
        published: false,
        status: String(existing.status ?? 'UNKNOWN')
      };
    }

    try {
      const event = await this.webhookRepository.create({
        mercadopago_event_id: metadata.eventId,
        notification_id: metadata.notificationId,
        resource_id: metadata.resourceId,
        topic: metadata.topic,
        action: metadata.action,
        api_version: metadata.apiVersion,
        live_mode: metadata.liveMode,
        created_at_mp: metadata.createdAtMp,
        received_at: new Date().toISOString(),
        payload_raw: input.payload,
        headers_raw: input.headers,
        status: 'RECEIVED',
        process_attempts: 0,
        last_error: null
      });

      const routingKey = buildWebhookRoutingKey(metadata.topic, metadata.action);
      const message = buildWebhookMessage({
        eventId: metadata.eventId,
        topic: metadata.topic,
        action: metadata.action,
        createdAtMp: metadata.createdAtMp,
        liveMode: metadata.liveMode,
        payload: input.payload,
        headers: input.headers,
        requestId: input.requestId
      });

      const publishResult = await this.publisher.publish({
        exchange: this.exchange,
        routingKey,
        payload: message,
        correlationId: input.requestId,
        messageId: metadata.eventId
      });

      if (!publishResult.published) {
        const sanitized = sanitizeError(publishResult.error);
        await this.webhookRepository.updateStatusByEventId(metadata.eventId, {
          status: 'FAILED',
          lastError: sanitized,
          incrementAttempts: true
        });

        logger.error(
          {
            event_id: metadata.eventId,
            request_id: input.requestId ?? null,
            error: sanitized
          },
          'mercadopago_webhook_publish_failed'
        );

        return {
          event,
          created: true,
          published: false,
          status: 'FAILED'
        };
      }

      await this.webhookRepository.updateStatusByEventId(metadata.eventId, {
        status: 'PROCESSED',
        lastError: null
      });

      logger.info(
        {
          event_id: metadata.eventId,
          request_id: input.requestId ?? null,
          routing_key: routingKey
        },
        'mercadopago_webhook_published'
      );

      return {
        event,
        created: true,
        published: true,
        status: 'PROCESSED'
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AppError('Erro ao registrar webhook', 500, message);
    }
  }
}

const sanitizeError = (value?: string): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
};
