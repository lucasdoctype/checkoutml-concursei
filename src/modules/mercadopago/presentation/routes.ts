import { Router } from 'express';
import type { Dependencies } from '../../../main/composition-root';
import { ReceiveMercadoPagoWebhookUseCase } from '../application/usecases/receive-mercadopago-webhook-usecase';
import { CreateMercadoPagoSubscriptionUseCase } from '../application/usecases/create-mercadopago-subscription-usecase';
import { UpdateMercadoPagoSubscriptionStatusUseCase } from '../application/usecases/update-mercadopago-subscription-status-usecase';
import { CreateMercadoPagoPixPaymentUseCase } from '../application/usecases/create-mercadopago-pix-payment-usecase';
import { MercadoPagoWebhookController } from './mercadopago-webhook-controller';
import { MercadoPagoSubscriptionController } from './mercadopago-subscription-controller';
import { MercadoPagoPixController } from './mercadopago-pix-controller';

export const buildMercadoPagoRoutes = (deps: Dependencies): Router => {
  const router = Router();
  const webhookUseCase = new ReceiveMercadoPagoWebhookUseCase(
    deps.repositories.mercadopagoWebhookRepository,
    deps.mq.publisher,
    deps.mq.config.exchange
  );
  const webhookController = new MercadoPagoWebhookController(webhookUseCase);
  const subscriptionController = new MercadoPagoSubscriptionController(
    new CreateMercadoPagoSubscriptionUseCase(deps.clients.mercadopagoApiClient),
    new UpdateMercadoPagoSubscriptionStatusUseCase(deps.clients.mercadopagoApiClient)
  );
  const pixController = new MercadoPagoPixController(
    new CreateMercadoPagoPixPaymentUseCase(deps.clients.mercadopagoApiClient)
  );

  router.post('/webhooks/mercadopago', (req, res, next) => webhookController.handle(req, res, next));
  router.post('/subscriptions', (req, res, next) => subscriptionController.create(req, res, next));
  router.post('/subscriptions/:id/cancel', (req, res, next) => subscriptionController.cancel(req, res, next));
  router.post('/subscriptions/:id/pause', (req, res, next) => subscriptionController.pause(req, res, next));
  router.post('/subscriptions/:id/resume', (req, res, next) => subscriptionController.resume(req, res, next));
  router.post('/pix/payments', (req, res, next) => pixController.create(req, res, next));

  return router;
};
