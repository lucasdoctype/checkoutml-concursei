import type { RecordData } from '../../../../shared/types/records';
import type { MercadoPagoApiClient } from '../ports/MercadoPagoApiClient';

export class CreateMercadoPagoSubscriptionUseCase {
  constructor(private readonly apiClient: MercadoPagoApiClient) {}

  async execute(payload: RecordData): Promise<RecordData> {
    return this.apiClient.createSubscription(payload);
  }
}
