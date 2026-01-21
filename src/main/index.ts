import '../tracing';
import * as dns from 'node:dns';
import { env } from '../config/env';
import { logger } from '../shared/logging/logger';
import { buildDependencies } from './composition-root';
import { buildServer } from './server';

dns.setDefaultResultOrder('ipv4first');

const start = async () => {
  const dependencies = buildDependencies();
  logHttpConfig(dependencies);

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

const logHttpConfig = (dependencies: ReturnType<typeof buildDependencies>): void => {
  const mqInfo = parseUrlInfo(env.RABBITMQ_URL);
  const dbInfo = parseUrlInfo(env.DATABASE_URL);
  const supabaseInfo = parseUrlInfo(env.SUPABASE_URL);

  logger.info(
    {
      db_adapter: env.DATABASE_URL ? 'pg' : 'supabase',
      db_host: dbInfo?.host ?? null,
      db_port: dbInfo?.port ?? null,
      db_name: dbInfo?.database ?? null,
      supabase_host: supabaseInfo?.host ?? null,
      mq_host: mqInfo?.host ?? null,
      mq_port: mqInfo?.port ?? null,
      mq_exchange: dependencies.mq.config.exchange,
      mq_queue_process: dependencies.mq.config.processQueue
    },
    'mercadopago_http_config'
  );
};

const parseUrlInfo = (
  value?: string | null
): { host: string; port: number | null; database: string | null } | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const database = url.pathname ? url.pathname.replace(/^\/+/, '') : null;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : null,
      database: database && database.length > 0 ? database : null
    };
  } catch {
    return null;
  }
};
