import type { RequestHandler } from 'express';
import { env } from '../../config/env';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error';

export const requireInternalAccess: RequestHandler = (req, _res, next) => {
  if (env.NODE_ENV === 'production') {
    next(new ForbiddenError('internal_disabled'));
    return;
  }

  const token = req.header('x-internal-token');
  if (!env.INTERNAL_API_TOKEN || token !== env.INTERNAL_API_TOKEN) {
    next(new UnauthorizedError('invalid_internal_token'));
    return;
  }

  next();
};
