import { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.locals.errorCode = 'NOT_FOUND';
  res.status(404).json({ error: 'not_found', request_id: req.correlationId });
};
