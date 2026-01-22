import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';
import { ValidationError } from '../../../shared/errors/app-error';
import type { CreateMercadoPagoPixPaymentUseCase } from '../application/usecases/create-mercadopago-pix-payment-usecase';
import { asString, getNested, requireObjectBody } from './mercadopago-http-utils';
import { logger } from '../../../shared/logging/logger';
import type { RecordData } from '../../../shared/types/records';

export class MercadoPagoPixController {
  constructor(private readonly createUseCase: CreateMercadoPagoPixPaymentUseCase) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = requireObjectBody(req) as RecordData;
      const normalized = normalizePixPayload(payload);
      if (!normalized) {
        throw new ValidationError('invalid_pix_payload');
      }

      if (!normalized.notification_url && env.MERCADOPAGO_NOTIFICATION_URL) {
        normalized.notification_url = env.MERCADOPAGO_NOTIFICATION_URL;
      }

      logger.info(
        {
          correlation_id: req.correlationId,
          payload: summarizePixPayload(normalized)
        },
        'mercadopago_pix_request'
      );

      const response = await this.createUseCase.execute(normalized);
      const mapped = mapPixResponse(response);

      logger.info(
        {
          correlation_id: req.correlationId,
          payment_id: mapped.payment_id,
          status: mapped.status,
          status_detail: mapped.status_detail,
          qr_code_present: Boolean(mapped.qr_code || mapped.qr_code_base64 || mapped.ticket_url)
        },
        'mercadopago_pix_response'
      );

      res.status(201).json(mapped);
    } catch (error) {
      next(error);
    }
  }
}

const normalizePixPayload = (payload: Record<string, unknown>): Record<string, unknown> | null => {
  const transactionAmountRaw = payload.transaction_amount;
  const transactionAmount =
    typeof transactionAmountRaw === 'string'
      ? Number(transactionAmountRaw)
      : transactionAmountRaw;

  if (typeof transactionAmount !== 'number' || !Number.isFinite(transactionAmount)) {
    return null;
  }

  const description = payload.description;
  if (typeof description !== 'string' || description.length === 0) {
    return null;
  }

  const payer = resolvePayer(payload);
  if (!payer) {
    return null;
  }

  return {
    ...payload,
    transaction_amount: transactionAmount,
    payment_method_id: payload.payment_method_id ?? 'pix',
    payer
  };
};

const resolvePayer = (payload: Record<string, unknown>): Record<string, unknown> | null => {
  if (payload.payer && typeof payload.payer === 'object') {
    const email = asString(getNested(payload.payer, ['email']));
    if (email) {
      return payload.payer as Record<string, unknown>;
    }
  }

  const payerEmail = asString(payload.payer_email);
  if (!payerEmail) {
    return null;
  }

  return { email: payerEmail };
};

const mapPixResponse = (response: Record<string, unknown>) => {
  const transactionData =
    (getNested(response, ['point_of_interaction', 'transaction_data']) as Record<string, unknown>) ??
    null;

  return {
    payment_id: asString(response.id),
    status: asString(response.status),
    status_detail: asString(response.status_detail),
    qr_code: asString(getNested(transactionData, ['qr_code'])),
    qr_code_base64: asString(getNested(transactionData, ['qr_code_base64'])),
    ticket_url: asString(getNested(transactionData, ['ticket_url'])),
    payment: response
  };
};

const summarizePixPayload = (payload: RecordData): RecordData => {
  const summary: RecordData = {};
  const maybe = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    summary[key] = value;
  };

  maybe('transaction_amount', payload.transaction_amount);
  maybe('description', payload.description);
  maybe('external_reference', payload.external_reference);
  maybe('notification_url', payload.notification_url);
  maybe('payment_method_id', payload.payment_method_id);
  maybe('payer_email', (payload.payer as RecordData | undefined)?.email ?? payload.payer_email);
  maybe('payer_identification', (payload.payer as RecordData | undefined)?.identification);
  return summary;
};
