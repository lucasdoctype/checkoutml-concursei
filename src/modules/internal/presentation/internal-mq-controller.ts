import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { MessagePublisher } from '../../../shared/mq/message-publisher';
import type { MqConfig } from '../../../infrastructure/mq/config';
import type { RabbitMqStatus } from '../../../infrastructure/mq/connection';
import type { RecordData } from '../../../shared/types/records';

interface InternalMqControllerDeps {
  publisher: MessagePublisher;
  config: MqConfig;
  getStatus: () => RabbitMqStatus;
}

export class InternalMqController {
  private readonly publisher: MessagePublisher;
  private readonly config: MqConfig;
  private readonly getStatus: () => RabbitMqStatus;

  constructor(deps: InternalMqControllerDeps) {
    this.publisher = deps.publisher;
    this.config = deps.config;
    this.getStatus = deps.getStatus;
  }

  async publishMock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = resolveObjectBody(req);
      const exchange = asString(body.exchange) ?? this.config.exchange;
      const routingKey = asString(body.routingKey) ?? 'mercadopago.internal.test';
      const payload = resolvePayload(body.payload, req.correlationId);

      const result = await this.publisher.publish({
        exchange,
        routingKey,
        payload,
        correlationId: req.correlationId
      });

      res.status(200).json({
        requestId: req.correlationId,
        published: result.published,
        exchange,
        routingKey,
        payload,
        messageId: result.messageId ?? null,
        error: result.error ?? null
      });
    } catch (error) {
      next(error);
    }
  }

  status(_req: Request, res: Response): void {
    const status = this.getStatus();
    res.status(200).json({
      connected: status.connected,
      channel: status.channelReady,
      exchange: this.config.exchange,
      dlx: this.config.dlx,
      queues: {
        process: this.config.processQueue,
        dlq: this.config.dlqQueue,
        retry: this.config.retryQueues.map((queue) => queue.name)
      }
    });
  }
}

const resolveObjectBody = (req: Request): RecordData => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as RecordData;
  }
  return {};
};

const resolvePayload = (value: unknown, requestId?: string): RecordData => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as RecordData;
  }

  const eventId = `mock_${randomUUID()}`;
  const dataId = `mock_${randomUUID()}`;

  return {
    eventId,
    topic: 'payment',
    action: 'payment.created',
    createdAt: new Date().toISOString(),
    liveMode: false,
    data: { id: dataId },
    headers: {},
    requestId: requestId ?? null
  };
};

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};
