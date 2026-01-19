import { SupabaseClient } from '@supabase/supabase-js';
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

export class SupabaseMercadoPagoWebhookRepository implements MercadoPagoWebhookRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByEventId(eventId: string): Promise<RecordData | null> {
    const { data, error } = await this.client
      .from('mercadopago_webhook_events')
      .select(SELECT_FIELDS)
      .eq('mercadopago_event_id', eventId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as RecordData) ?? null;
  }

  async create(input: RecordData): Promise<RecordData> {
    const { data, error } = await this.client
      .from('mercadopago_webhook_events')
      .insert({
        mercadopago_event_id: input.mercadopago_event_id,
        notification_id: input.notification_id,
        resource_id: input.resource_id,
        topic: input.topic,
        action: input.action,
        api_version: input.api_version,
        live_mode: input.live_mode,
        created_at_mp: input.created_at_mp,
        received_at: input.received_at,
        payload_raw: input.payload_raw,
        headers_raw: input.headers_raw,
        status: input.status,
        process_attempts: input.process_attempts,
        last_error: input.last_error
      })
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw error;
    }

    return data as RecordData;
  }
}
