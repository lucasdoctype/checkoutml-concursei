import { randomUUID } from 'crypto';
import type { ConfirmChannel, Options } from 'amqplib';
import { logger } from '../../shared/logging/logger';
import type { MessagePublisher, PublishInput, PublishResult } from '../../shared/mq/message-publisher';
import { RabbitMqConnection } from './connection';

export class RabbitMqPublisher implements MessagePublisher {
  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly defaultTimeoutMs: number
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const channel = await this.connection.ensureChannel();
    if (!channel) {
      return { published: false, error: 'channel_unavailable' };
    }

    let content: Buffer;
    try {
      content = Buffer.from(JSON.stringify(input.payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, 'rabbitmq_payload_serialize_failed');
      return { published: false, error: message };
    }

    const messageId = input.messageId ?? randomUUID();
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;
    const headers = { ...(input.headers ?? {}) };

    if (input.correlationId && headers['x-request-id'] === undefined) {
      headers['x-request-id'] = input.correlationId;
    }

    const options: Options.Publish = {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      persistent: true,
      messageId,
      correlationId: input.correlationId,
      headers,
      timestamp: Math.floor(Date.now() / 1000)
    };

    return publishWithConfirm(channel, input.exchange, input.routingKey, content, options, timeoutMs);
  }
}

const publishWithConfirm = async (
  channel: ConfirmChannel,
  exchange: string,
  routingKey: string,
  content: Buffer,
  options: Options.Publish,
  timeoutMs: number
): Promise<PublishResult> => {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ published: false, error: 'publish_timeout', messageId: options.messageId });
    }, timeoutMs);

    const onPublish = (err?: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        resolve({ published: false, error: err.message, messageId: options.messageId });
        return;
      }
      resolve({ published: true, messageId: options.messageId });
    };

    channel.publish(exchange, routingKey, content, options, onPublish);
  });
};
