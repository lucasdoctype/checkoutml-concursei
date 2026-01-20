// PgMercadoPagoWebhookRepository.ts
import { Pool } from 'pg';
import type { MercadoPagoWebhookRepository } from '../../../../modules/mercadopago/application/ports/MercadoPagoWebhookRepository';
import type { RecordData } from '../../../../shared/types/records';

const TABLE = 'presenq_mvp.mercadopago_webhook_events';

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
        FROM ${TABLE}
        WHERE mercadopago_event_id = $1
        LIMIT 1
      `,
      [eventId]
    );

    return (result.rows[0] as RecordData | undefined) ?? null;
  }

  async create(input: RecordData): Promise<RecordData> {
    const result = await this.pool.query(
      `
        INSERT INTO ${TABLE} (
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

    return result.rows[0] as RecordData;
  }

  async updateStatusByEventId(
    eventId: string,
    input: { status?: string; lastError?: string | null; incrementAttempts?: boolean }
  ): Promise<RecordData> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.status) {
      updates.push(`status = $${index++}`);
      values.push(input.status);
    }

    if (input.lastError !== undefined) {
      updates.push(`last_error = $${index++}`);
      values.push(input.lastError);
    }

    if (input.incrementAttempts) {
      updates.push('process_attempts = process_attempts + 1');
    }

    if (updates.length === 0) {
      const existing = await this.findByEventId(eventId);
      if (!existing) throw new Error('event_not_found');
      return existing;
    }

    values.push(eventId);

    const result = await this.pool.query(
      `
        UPDATE ${TABLE}
        SET ${updates.join(', ')}
        WHERE mercadopago_event_id = $${index}
        RETURNING ${SELECT_FIELDS}
      `,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('event_not_found');
    }

    return result.rows[0] as RecordData;
  }

  async listFailed(limit: number): Promise<RecordData[]> {
    const result = await this.pool.query(
      `
        SELECT ${SELECT_FIELDS}
        FROM ${TABLE}
        WHERE status = 'FAILED'
        ORDER BY received_at ASC
        LIMIT $1
      `,
      [limit]
    );

    return (result.rows as RecordData[]) ?? [];
  }
}
