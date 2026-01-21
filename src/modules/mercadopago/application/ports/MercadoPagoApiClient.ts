import type { RecordData } from '../../../../shared/types/records';

export interface MercadoPagoApiClient {
  createSubscription(payload: RecordData): Promise<RecordData>;
  updateSubscription(id: string, payload: RecordData): Promise<RecordData>;
  createPixPayment(payload: RecordData): Promise<RecordData>;
  getPayment(id: string): Promise<RecordData>;
  getMerchantOrder(idOrUrl: string): Promise<RecordData>;
}
