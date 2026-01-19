import express, { Request, Response } from 'express';
import cors from 'cors';
import { env } from '../config/env';
import { errorHandler } from '../shared/http/error-handler';
import { notFoundHandler } from '../shared/http/not-found';
import { httpLogger } from '../shared/logging/http-logger';
import { correlationIdMiddleware } from '../shared/logging/request-id';
import type { Dependencies } from './composition-root';
import { buildRoutes } from './routes';
import { buildInternalRoutes } from './internal-routes';
import { renderMetrics } from '../shared/metrics/metrics';

const rawBodySaver = (req: Request, _res: Response, buf: Buffer) => {
  if (buf && buf.length > 0) {
    (req as Request).rawBody = buf.toString('utf8');
  }
};

export const buildServer = (dependencies: Dependencies) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(correlationIdMiddleware);
  app.use(httpLogger);
  app.use(
    cors({
      origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((value) => value.trim()) : true,
      credentials: true
    })
  );
  app.use(express.json({ limit: '2mb', verify: rawBodySaver }));

  const readyHandler = async (_req: express.Request, res: express.Response) => {
    const [dbOk, rabbitOk] = await Promise.all([
      dependencies.health.checkDatabase(),
      dependencies.health.checkRabbit()
    ]);

    if (dbOk && rabbitOk) {
      res.status(200).json({ status: 'ok' });
      return;
    }

    res.status(503).json({ status: 'unready', db_ok: dbOk, rabbit_ok: rabbitOk });
  };

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get(`${env.API_BASE_PATH}/health`, (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/ready', readyHandler);
  app.get(`${env.API_BASE_PATH}/ready`, readyHandler);
  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(renderMetrics());
  });
  app.get(`${env.API_BASE_PATH}/metrics`, (_req, res) => {
    res.type('text/plain').send(renderMetrics());
  });

  app.use(buildInternalRoutes(dependencies));
  app.use(env.API_BASE_PATH, buildRoutes(dependencies));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
