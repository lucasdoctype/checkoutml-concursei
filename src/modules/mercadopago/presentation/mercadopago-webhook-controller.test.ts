import { describe, it, expect, vi } from 'vitest';

describe('MercadoPagoWebhookController', () => {
  it('returns 500 when use case fails before persisting', async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = '';
    process.env.MERCADOPAGO_WEBHOOK_STRICT_SIGNATURE = 'false';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    vi.resetModules();

    const { MercadoPagoWebhookController } = await import('./mercadopago-webhook-controller');
    const { AppError } = await import('../../../shared/errors/app-error');
    const { errorHandler } = await import('../../../shared/http/error-handler');

    const useCase = {
      execute: async () => {
        throw new AppError('Erro ao registrar webhook', 500, 'db down');
      }
    } as { execute: (input: unknown) => Promise<unknown> };

    const controller = new MercadoPagoWebhookController(useCase as never);

    const req = {
      rawBody: JSON.stringify({ id: 'evt_1', data: { id: 'pay_1' } }),
      body: { id: 'evt_1', data: { id: 'pay_1' } },
      headers: {},
      query: {},
      correlationId: 'req-1',
      header: () => undefined
    } as unknown as Parameters<typeof controller.handle>[0];

    const res = {
      locals: {},
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      }
    } as unknown as Parameters<typeof controller.handle>[1];

    const next = (err?: Error) => {
      if (err) {
        errorHandler(err, req as never, res as never, () => {});
      }
    };

    await controller.handle(req, res, next);

    expect(res.statusCode).toBe(500);
  });
});
