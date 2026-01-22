import type { RecordData } from '../../../shared/types/records';
import { AppError, UnauthorizedError } from '../../../shared/errors/app-error';
import type { MercadoPagoApiClient } from '../../../modules/mercadopago/application/ports/MercadoPagoApiClient';
import { logger } from '../../../shared/logging/logger';

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

  async getPayment(id: string): Promise<RecordData> {
    return this.request('GET', `/v1/payments/${encodeURIComponent(id)}`);
  }

  async getMerchantOrder(idOrUrl: string): Promise<RecordData> {
    const path = isAbsoluteUrl(idOrUrl)
      ? idOrUrl
      : `/merchant_orders/${encodeURIComponent(idOrUrl)}`;
    return this.request('GET', path);
  }

  private async request(method: string, path: string, payload?: RecordData): Promise<RecordData> {
    if (!this.accessToken) {
      throw new UnauthorizedError('missing_mercadopago_access_token');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const url = resolveUrl(this.baseUrl, path);
    const tokenPrefix = this.accessToken ? this.accessToken.slice(0, 8) : null;

    logger.info(
      {
        method,
        url,
        path,
        token_prefix: tokenPrefix,
        timeout_ms: this.timeoutMs,
        payload: summarizePayload(payload)
      },
      'mercadopago_http_request'
    );

    try {
      const response = await fetch(url, {
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
        logger.error(
          {
            method,
            url,
            path,
            status: response.status,
            body: summarizeResponse(responseBody),
            token_prefix: tokenPrefix
          },
          'mercadopago_http_response_error'
        );

        throw new AppError('mercadopago_request_failed', response.status, {
          status: response.status,
          body: responseBody
        });
      }

      const normalizedBody =
        responseBody && typeof responseBody === 'object'
          ? (responseBody as RecordData)
          : { response: responseBody };

      logger.info(
        {
          method,
          url,
          path,
          status: response.status,
          body: summarizeResponse(normalizedBody),
          token_prefix: tokenPrefix
        },
        'mercadopago_http_response_ok'
      );

      return normalizedBody;
    } finally {
      clearTimeout(timeout);
    }
  }
}

const resolveUrl = (baseUrl: string, path: string): string => {
  if (isAbsoluteUrl(path)) {
    return path;
  }
  return `${baseUrl}${path}`;
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const parseResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const summarizePayload = (payload?: RecordData): RecordData | null => {
  if (!payload || typeof payload !== 'object') return null;
  const summary: RecordData = {};
  const maybe = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    summary[key] = value;
  };

  maybe('transaction_amount', payload.transaction_amount);
  maybe('description', payload.description);
  maybe('external_reference', payload.external_reference);
  maybe('notification_url', payload.notification_url);
  maybe('payer_email', (payload.payer as RecordData | undefined)?.email ?? payload.payer_email);
  maybe('payment_method_id', payload.payment_method_id);
  maybe('plan_id', payload.plan_id);
  maybe('back_url', payload.back_url);
  maybe('auto_recurring', payload.auto_recurring);
  maybe('binary_mode', payload.binary_mode);
  return summary;
};

const summarizeResponse = (body: unknown): RecordData | null => {
  if (!body || typeof body !== 'object') {
    return body ? { response: body } : null;
  }

  const data = body as RecordData;
  const summary: RecordData = {};
  const maybe = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    summary[key] = value;
  };

  maybe('id', data.id ?? data.payment_id);
  maybe('status', data.status);
  maybe('status_detail', data.status_detail);
  maybe('init_point', data.init_point ?? (data.sandbox_init_point as string | undefined));
  maybe('external_reference', data.external_reference);
  maybe('payment_type_id', data.payment_type_id);
  maybe('payment_method_id', data.payment_method_id);
  maybe('transaction_amount', data.transaction_amount);
  maybe('payer_email', (data.payer as RecordData | undefined)?.email ?? data.payer_email);

  if (Object.keys(summary).length === 0) {
    return data;
  }

  return summary;
};
