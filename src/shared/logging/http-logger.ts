import { RequestHandler } from 'express';
import { logger } from './logger';
import { recordRequest } from '../metrics/metrics';

export const httpLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    const routePath = req.route?.path;
    const baseUrl = req.baseUrl ?? '';
    const path = routePath ? `${baseUrl}${routePath}` : req.originalUrl;
    const errorCode = res.locals.errorCode ?? null;

    recordRequest(
      {
        method: req.method,
        path,
        status: String(res.statusCode)
      },
      Math.round(latencyMs),
      errorCode
    );

    logger.info(
      {
        request_id: req.correlationId,
        method: req.method,
        path,
        status: res.statusCode,
        latency_ms: Math.round(latencyMs),
        error_code: errorCode ?? null,
        webhook_event_id: res.locals.webhookEventId ?? null
      },
      'http_request'
    );
  });

  next();
};
