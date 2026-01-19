import type { RecordData } from '../../../../shared/types/records';
import type { MercadoPagoApiClient } from '../ports/MercadoPagoApiClient';

export class UpdateMercadoPagoSubscriptionStatusUseCase {
  constructor(private readonly apiClient: MercadoPagoApiClient) {}

  async execute(id: string, status: string): Promise<RecordData> {
    return this.apiClient.updateSubscription(id, { status });
  }
}
