import type { RecordData } from '../../../../shared/types/records';

export interface MercadoPagoWebhookRepository {
  findByEventId(eventId: string): Promise<RecordData | null>;
  create(input: RecordData): Promise<RecordData>;
}
