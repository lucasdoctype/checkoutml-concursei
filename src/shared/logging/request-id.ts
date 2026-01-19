import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';

export const correlationIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id') ?? req.header('x-correlation-id');
  const requestId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();

  req.correlationId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};
