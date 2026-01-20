// SupabaseMercadoPagoWebhookRepository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MercadoPagoWebhookRepository } from '../../../../modules/mercadopago/application/ports/MercadoPagoWebhookRepository';
import type { RecordData } from '../../../../shared/types/records';

const SCHEMA = 'presenq_mvp';
const TABLE = 'mercadopago_webhook_events';

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

  private table() {
    return this.client.schema(SCHEMA).from(TABLE);
  }

  async findByEventId(eventId: string): Promise<RecordData | null> {
    const { data, error } = await this.table()
      .select(SELECT_FIELDS)
      .eq('mercadopago_event_id', eventId)
      .maybeSingle();

    if (error) throw error;
    return (data as RecordData) ?? null;
  }

  async create(input: RecordData): Promise<RecordData> {
    const { data, error } = await this.table()
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

    if (error) throw error;
    return data as RecordData;
  }

  async updateStatusByEventId(
    eventId: string,
    input: { status?: string; lastError?: string | null; incrementAttempts?: boolean }
  ): Promise<RecordData> {
    if (!input.status && input.lastError === undefined && !input.incrementAttempts) {
      const existing = await this.findByEventId(eventId);
      if (!existing) throw new Error('event_not_found');
      return existing;
    }

    const updatePayload: Record<string, unknown> = {};

    if (input.status) updatePayload.status = input.status;
    if (input.lastError !== undefined) updatePayload.last_error = input.lastError;

    // Evita race: incrementa com RPC se existir; se não, faz leitura+update (mantive simples)
    if (input.incrementAttempts) {
      const { data: current, error: selectError } = await this.table()
        .select('process_attempts')
        .eq('mercadopago_event_id', eventId)
        .maybeSingle();

      if (selectError) throw selectError;

      const attempts = Number((current as RecordData | null)?.process_attempts ?? 0);
      updatePayload.process_attempts = attempts + 1;
    }

    const { data, error } = await this.table()
      .update(updatePayload)
      .eq('mercadopago_event_id', eventId)
      .select(SELECT_FIELDS)
      .single();

    if (error) throw error;
    return data as RecordData;
  }

  async listFailed(limit: number): Promise<RecordData[]> {
    const { data, error } = await this.table()
      .select(SELECT_FIELDS)
      .eq('status', 'FAILED')
      .order('received_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (data as RecordData[]) ?? [];
  }
}
