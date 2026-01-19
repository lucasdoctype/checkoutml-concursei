import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';
import type { CreateMercadoPagoSubscriptionUseCase } from '../application/usecases/create-mercadopago-subscription-usecase';
import type { UpdateMercadoPagoSubscriptionStatusUseCase } from '../application/usecases/update-mercadopago-subscription-status-usecase';
import { asString, getNested, requireObjectBody, requirePathParam } from './mercadopago-http-utils';

export class MercadoPagoSubscriptionController {
  constructor(
    private readonly createUseCase: CreateMercadoPagoSubscriptionUseCase,
    private readonly updateStatusUseCase: UpdateMercadoPagoSubscriptionStatusUseCase
  ) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = requireObjectBody(req);
      if (!payload.notification_url && env.MERCADOPAGO_NOTIFICATION_URL) {
        payload.notification_url = env.MERCADOPAGO_NOTIFICATION_URL;
      }

      const response = await this.createUseCase.execute(payload);
      res.status(201).json(mapSubscriptionResponse(response));
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
