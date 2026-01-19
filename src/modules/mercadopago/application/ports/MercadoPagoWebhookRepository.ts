import type { RecordData } from '../../../../shared/types/records';

export interface MercadoPagoWebhookRepository {
  findByEventId(eventId: string): Promise<RecordData | null>;
  create(input: RecordData): Promise<RecordData>;
  updateStatusByEventId(
    eventId: string,
    input: { status?: string; lastError?: string | null; incrementAttempts?: boolean }
  ): Promise<RecordData>;
  listFailed(limit: number): Promise<RecordData[]>;
}
