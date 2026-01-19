import { AppError, ValidationError } from '../../../../shared/errors/app-error';
import type { RecordData } from '../../../../shared/types/records';
import type { MercadoPagoWebhookRepository } from '../ports/MercadoPagoWebhookRepository';
import { extractWebhookMetadata } from '../../domain/mercadopago-webhook';

export interface ReceiveMercadoPagoWebhookInput {
  payload: RecordData;
  headers: RecordData;
}

export interface ReceiveMercadoPagoWebhookOutput {
  event: RecordData;
  created: boolean;
}

export class ReceiveMercadoPagoWebhookUseCase {
  constructor(private readonly webhookRepository: MercadoPagoWebhookRepository) {}

  async execute(input: ReceiveMercadoPagoWebhookInput): Promise<ReceiveMercadoPagoWebhookOutput> {
    const metadata = extractWebhookMetadata(input.payload);

    if (!metadata.eventId) {
      throw new ValidationError('missing_event_id');
    }

    const existing = await this.webhookRepository.findByEventId(metadata.eventId);
    if (existing) {
      return { event: existing, created: false };
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

      return { event, created: true };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AppError('Erro ao registrar webhook', 500, message);
    }
  }
}
