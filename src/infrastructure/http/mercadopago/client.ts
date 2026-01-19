import type { RecordData } from '../../../shared/types/records';
import { AppError, UnauthorizedError } from '../../../shared/errors/app-error';
import type { MercadoPagoApiClient } from '../../../modules/mercadopago/application/ports/MercadoPagoApiClient';

interface MercadoPagoHttpClientOptions {
  accessToken?: string;
  baseUrl: string;
  timeoutMs: number;
}

export class HttpMercadoPagoApiClient implements MercadoPagoApiClient {
  private readonly accessToken?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: MercadoPagoHttpClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
  }

  async createSubscription(payload: RecordData): Promise<RecordData> {
    return this.request('POST', '/preapproval', payload);
  }

  async updateSubscription(id: string, payload: RecordData): Promise<RecordData> {
    return this.request('PUT', `/preapproval/${encodeURIComponent(id)}`, payload);
  }

  async createPixPayment(payload: RecordData): Promise<RecordData> {
    return this.request('POST', '/v1/payments', payload);
  }

  private async request(method: string, path: string, payload?: RecordData): Promise<RecordData> {
    if (!this.accessToken) {
      throw new UnauthorizedError('missing_mercadopago_access_token');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal
      });

      const responseBody = await parseResponse(response);

      if (!response.ok) {
        throw new AppError('mercadopago_request_failed', response.status, {
          status: response.status,
          body: responseBody
        });
      }

      if (responseBody && typeof responseBody === 'object') {
        return responseBody as RecordData;
      }

      return { response: responseBody };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const parseResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
