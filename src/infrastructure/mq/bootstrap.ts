import type { ConfirmChannel } from 'amqplib';
import { logger } from '../../shared/logging/logger';
import type { MqConfig } from './config';
import { RabbitMqConnection } from './connection';

const RETRY_DEAD_LETTER_ROUTING_KEY = 'mercadopago.retry';

export const bootstrapRabbitMq = async (
  connection: RabbitMqConnection,
  config: MqConfig
): Promise<void> => {
  const channel = await connection.ensureChannel();
  if (!channel) {
    throw new Error('rabbitmq_channel_unavailable');
  }

  await assertExchanges(channel, config);
  await assertQueues(channel, config);

  logger.info(
    {
      exchange: config.exchange,
      dlx: config.dlx,
      process_queue: config.processQueue,
      dlq_queue: config.dlqQueue,
      retry_queues: config.retryQueues.map((queue) => queue.name)
    },
    'rabbitmq_bootstrap_complete'
  );
};

const assertExchanges = async (channel: ConfirmChannel, config: MqConfig): Promise<void> => {
  await channel.assertExchange(config.exchange, 'topic', { durable: true });
  await channel.assertExchange(config.dlx, 'direct', { durable: true });
};

const assertQueues = async (channel: ConfirmChannel, config: MqConfig): Promise<void> => {
  await channel.assertQueue(config.processQueue, { durable: true });
  await channel.bindQueue(config.processQueue, config.exchange, 'mercadopago.#');

  for (const retryQueue of config.retryQueues) {
    await channel.assertQueue(retryQueue.name, {
      durable: true,
      arguments: {
        'x-message-ttl': retryQueue.ttlMs,
        'x-dead-letter-exchange': config.exchange,
        'x-dead-letter-routing-key': RETRY_DEAD_LETTER_ROUTING_KEY
      }
    });
    await channel.bindQueue(retryQueue.name, config.dlx, retryQueue.routingKey);
  }

  await channel.assertQueue(config.dlqQueue, { durable: true });
  await channel.bindQueue(config.dlqQueue, config.dlx, config.dlqRoutingKey);
};
