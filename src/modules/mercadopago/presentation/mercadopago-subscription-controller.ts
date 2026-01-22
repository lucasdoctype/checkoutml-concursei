import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';
import type { CreateMercadoPagoSubscriptionUseCase } from '../application/usecases/create-mercadopago-subscription-usecase';
import type { UpdateMercadoPagoSubscriptionStatusUseCase } from '../application/usecases/update-mercadopago-subscription-status-usecase';
import { asString, getNested, requireObjectBody, requirePathParam } from './mercadopago-http-utils';
import { logger } from '../../../shared/logging/logger';
import type { RecordData } from '../../../shared/types/records';

export class MercadoPagoSubscriptionController {
  constructor(
    private readonly createUseCase: CreateMercadoPagoSubscriptionUseCase,
    private readonly updateStatusUseCase: UpdateMercadoPagoSubscriptionStatusUseCase
  ) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = requireObjectBody(req) as RecordData;
      if (!payload.notification_url && env.MERCADOPAGO_NOTIFICATION_URL) {
        payload.notification_url = env.MERCADOPAGO_NOTIFICATION_URL;
      }

      logger.info(
        {
          correlation_id: req.correlationId,
          payload: summarizeSubscriptionPayload(payload)
        },
        'mercadopago_subscription_request'
      );

      const response = await this.createUseCase.execute(payload);
      const mapped = mapSubscriptionResponse(response);

      logger.info(
        {
          correlation_id: req.correlationId,
          subscription_id: mapped.id,
          status: mapped.status,
          init_point_host: resolveHost(mapped.init_point)
        },
        'mercadopago_subscription_response'
      );

      res.status(201).json(mapped);
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    await this.updateStatus(req, res, next, 'cancelled');
  }

  async pause(req: Request, res: Response, next: NextFunction): Promise<void> {
    await this.updateStatus(req, res, next, 'paused');
  }

  async resume(req: Request, res: Response, next: NextFunction): Promise<void> {
    await this.updateStatus(req, res, next, 'authorized');
  }

  private async updateStatus(
    req: Request,
    res: Response,
    next: NextFunction,
    status: string
  ): Promise<void> {
    try {
      const id = requirePathParam(req, 'id');
      const response = await this.updateStatusUseCase.execute(id, status);
      res.status(200).json(mapSubscriptionResponse(response));
    } catch (error) {
      next(error);
    }
  }
}

const mapSubscriptionResponse = (response: Record<string, unknown>) => {
  const initPoint =
    asString(response.init_point) ??
    asString(response.sandbox_init_point) ??
    asString(getNested(response, ['init_point'])) ??
    asString(getNested(response, ['sandbox_init_point']));

  return {
    id: asString(response.id),
    status: asString(response.status),
    init_point: initPoint,
    payer_email: asString(response.payer_email) ?? asString(getNested(response, ['payer', 'email'])),
    subscription: response
  };
};

const summarizeSubscriptionPayload = (payload: RecordData): RecordData => {
  const summary: RecordData = {};
  const maybe = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    summary[key] = value;
  };

  maybe('payer_email', (payload.payer as RecordData | undefined)?.email ?? payload.payer_email);
  maybe('card_token_id', payload.card_token_id);
  maybe('auto_recurring', payload.auto_recurring);
  maybe('back_url', payload.back_url);
  maybe('notification_url', payload.notification_url);
  maybe('external_reference', payload.external_reference);
  maybe('reason', payload.reason);
  return summary;
};

const resolveHost = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};
