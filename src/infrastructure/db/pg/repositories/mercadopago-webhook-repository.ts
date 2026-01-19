import { Pool } from 'pg';
import type { MercadoPagoWebhookRepository } from '../../../../modules/mercadopago/application/ports/MercadoPagoWebhookRepository';
import type { RecordData } from '../../../../shared/types/records';

const SELECT_FIELDS = `
  id,
  mercadopago_event_id,
  notification_id,
  resource_id,
  topic,
  action,
  api_version,
  live_mode,
  created_at_mp,
  received_at,
  payload_raw,
  headers_raw,
  status,
  process_attempts,
  last_error
`;

export class PgMercadoPagoWebhookRepository implements MercadoPagoWebhookRepository {
  constructor(private readonly pool: Pool) {}

  async findByEventId(eventId: string): Promise<RecordData | null> {
    const result = await this.pool.query(
      `
        SELECT ${SELECT_FIELDS}
        FROM mercadopago_webhook_events
        WHERE mercadopago_event_id = $1
        LIMIT 1
      `,
      [eventId]
    );

    return result.rows[0] ?? null;
  }

  async create(input: RecordData): Promise<RecordData> {
    const result = await this.pool.query(
      `
        INSERT INTO mercadopago_webhook_events (
          mercadopago_event_id,
          notification_id,
          resource_id,
          topic,
          action,
          api_version,
          live_mode,
          created_at_mp,
          received_at,
          payload_raw,
          headers_raw,
          status,
          process_attempts,
          last_error
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING ${SELECT_FIELDS}
      `,
      [
        input.mercadopago_event_id,
        input.notification_id,
        input.resource_id,
        input.topic,
        input.action,
        input.api_version,
        input.live_mode,
        input.created_at_mp,
        input.received_at,
        input.payload_raw,
        input.headers_raw,
        input.status,
        input.process_attempts,
        input.last_error
      ]
    );

    return result.rows[0];
  }
}
