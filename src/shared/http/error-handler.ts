import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { logger } from '../logging/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const baseMeta = {
    correlationId: req.correlationId,
    webhook_event_id: res.locals.webhookEventId ?? null
  };

  const statusCode = (err as { status?: number }).status;
  if (err instanceof SyntaxError && statusCode === 400) {
    res.locals.errorCode = 'INVALID_JSON';
    logger.error({ err, error_code: 'INVALID_JSON', ...baseMeta }, 'handled_error');
    res.status(400).json({ error: 'invalid_json', request_id: req.correlationId });
    return;
  }

  if (err instanceof AppError) {
    res.locals.errorCode = err.message;
    logger.error(
      { err, error_code: err.message, ...baseMeta },
      'handled_error'
    );
    res.status(err.status).json({ error: err.message, details: err.details, request_id: req.correlationId });
    return;
  }

  res.locals.errorCode = 'INTERNAL_ERROR';
  logger.error({ err, error_code: 'INTERNAL_ERROR', ...baseMeta }, 'unhandled_error');

  res.status(500).json({ error: 'internal_error', request_id: req.correlationId });
};
