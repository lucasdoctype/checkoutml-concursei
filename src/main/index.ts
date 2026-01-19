import '../tracing';
import * as dns from 'node:dns';
import { env } from '../config/env';
import { logger } from '../shared/logging/logger';
import { buildServer } from './server';

dns.setDefaultResultOrder('ipv4first');

const app = buildServer();

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
