import type { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';
import { ValidationError } from '../../../shared/errors/app-error';
import { logger } from '../../../shared/logging/logger';
import type { ReceiveMercadoPagoWebhookUseCase } from '../application/usecases/receive-mercadopago-webhook-usecase';
import { extractWebhookMetadata } from '../domain/mercadopago-webhook';
import { validateMercadoPagoSignature } from '../domain/mercadopago-signature';

export class MercadoPagoWebhookController {
  constructor(private readonly useCase: ReceiveMercadoPagoWebhookUseCase) {}

  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = resolveRawBody(req);
      if (!rawBody) {
        throw new ValidationError('invalid_body');
      }

      const payload = parsePayload(req, rawBody);
      if (!payload) {
        throw new ValidationError('invalid_json');
      }

      const metadata = extractWebhookMetadata(payload);
      if (metadata.eventId) {
        res.locals.webhookEventId = metadata.eventId;
      }

      const queryDataId = resolveQueryDataId(req);
      if (!metadata.eventId && queryDataId) {
        payload.id = queryDataId;
        res.locals.webhookEventId = queryDataId;
      }

      // depois de rawBody/payload e antes da validação de assinatura
      logger.info(
        {
          correlationId: req.correlationId,
          method: req.method,
          path: req.originalUrl,
          query: req.query,
          headers: {
            'content-type': req.header('content-type'),
            'user-agent': req.header('user-agent'),
            'x-request-id': req.header('x-request-id'),
            'x-signature_present': Boolean(req.header('x-signature')),
            // se quiser ver o valor, recomendo truncar:
            'x-signature': (req.header('x-signature') ?? '').slice(0, 80) || null
          },
          rawBody_preview: rawBody.slice(0, 500),
          payload_keys: payload ? Object.keys(payload) : null
        },
        'mercadopago_webhook_incoming'
      );

      if (env.MERCADOPAGO_WEBHOOK_SECRET && env.MERCADOPAGO_WEBHOOK_STRICT_SIGNATURE) {
        const signatureHeader = req.header('x-signature');
        const requestIdHeader = req.header('x-request-id') ?? undefined;
        const dataId =
          metadata.resourceId ?? metadata.notificationId ?? queryDataId ?? undefined;

        const validation = validateMercadoPagoSignature({
          signatureHeader,
          requestId: requestIdHeader,
          dataId,
          secret: env.MERCADOPAGO_WEBHOOK_SECRET,
          toleranceSec: env.MERCADOPAGO_WEBHOOK_TOLERANCE_SEC
        });

        if (!validation.valid) {
          logger.warn(
            {
              correlationId: req.correlationId,
              request_id_header: requestIdHeader ?? null,
              data_id: dataId ?? null,
              signature_timestamp: validation.details?.timestamp ?? null,
              signature_v1: validation.details?.signature ?? null,
              signature_expected: validation.details?.expected ?? null
            },
            'mercadopago_webhook_invalid_signature'
          );
          throw new ValidationError('invalid_signature', { reason: validation.reason });
        }
      }

      const headers = normalizeHeaders(req.headers);
      const result = await this.useCase.execute({
        payload,
        headers,
        requestId: req.correlationId
      });

      res.status(200).json({
        received: true,
        duplicate: !result.created,
        event_id: metadata.eventId,
        request_id: req.correlationId,
        published: result.published,
        status: result.status
      });
    } catch (error) {
      next(error);
    }
  }
}

const resolveRawBody = (req: Request): string | null => {
  if (typeof req.rawBody === 'string' && req.rawBody.length > 0) {
    return req.rawBody;
  }

  if (typeof req.body === 'string') {
    return req.body;
  }

  if (req.body && typeof req.body === 'object') {
    try {
      return JSON.stringify(req.body);
    } catch {
      return null;
    }
  }

  return null;
};

const parsePayload = (req: Request, rawBody: string): Record<string, unknown> | null => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const normalizeHeaders = (headers: Request['headers']): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
};

const resolveQueryDataId = (req: Request): string | null => {
  const directId = readQueryString(req.query, 'id');
  if (directId) {
    return directId;
  }

  const dataId = readQueryString(req.query, 'data.id');
  return dataId ?? null;
};

const readQueryString = (query: Request['query'], key: string): string | null => {
  const value = query[key];
  if (!value) return null;
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }
  return typeof value === 'string' ? value : null;
};
