import '../tracing';
import { env } from '../config/env';
import { buildDependencies } from './composition-root';
import { RepublishFailedWebhooksUseCase } from '../modules/mercadopago/application/usecases/republish-failed-webhooks-usecase';
import { logger } from '../shared/logging/logger';

const run = async () => {
  const dependencies = buildDependencies();
  await dependencies.mq.bootstrap();

  const useCase = new RepublishFailedWebhooksUseCase(
    dependencies.repositories.mercadopagoWebhookRepository,
    dependencies.mq.publisher,
    {
      exchange: dependencies.mq.config.exchange,
      dlx: dependencies.mq.config.dlx,
      dlqRoutingKey: dependencies.mq.config.dlqRoutingKey,
      maxAttempts: env.MAX_ATTEMPTS
    }
  );

  const result = await useCase.execute();
  logger.info(result, 'republish_failed_completed');
};

void run().catch((error) => {
  logger.error({ err: error }, 'republish_failed_error');
  process.exit(1);
});
