import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';
import { ValidationError } from '../../../shared/errors/app-error';
import type { CreateMercadoPagoPixPaymentUseCase } from '../application/usecases/create-mercadopago-pix-payment-usecase';
import { asString, getNested, requireObjectBody } from './mercadopago-http-utils';

export class MercadoPagoPixController {
  constructor(private readonly createUseCase: CreateMercadoPagoPixPaymentUseCase) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = requireObjectBody(req);
      const normalized = normalizePixPayload(payload);
      if (!normalized) {
        throw new ValidationError('invalid_pix_payload');
      }

      if (!normalized.notification_url && env.MERCADOPAGO_NOTIFICATION_URL) {
        normalized.notification_url = env.MERCADOPAGO_NOTIFICATION_URL;
      }

      const response = await this.createUseCase.execute(normalized);
      res.status(201).json(mapPixResponse(response));
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
