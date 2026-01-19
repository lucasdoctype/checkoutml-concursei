import '../tracing';
import * as dns from 'node:dns';
import { env } from '../config/env';
import { logger } from '../shared/logging/logger';
import { buildDependencies } from './composition-root';
import { buildServer } from './server';

dns.setDefaultResultOrder('ipv4first');

const start = async () => {
  const dependencies = buildDependencies();

  await dependencies.mq.bootstrap();

  const app = buildServer(dependencies);

  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'uncaught_exception');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled_rejection');
  });

  app.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        basePath: env.API_BASE_PATH
      },
      'server_listening'
    );
  });
};

void start().catch((error) => {
  logger.error({ err: error }, 'server_start_failed');
  process.exit(1);
});
