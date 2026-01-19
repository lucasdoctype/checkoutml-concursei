import type { MessagePublisher } from '../../shared/mq/message-publisher';
import type { MqConfig } from './config';
import { buildMqConfig } from './config';
import { RabbitMqConnection, RabbitMqStatus } from './connection';
import { RabbitMqPublisher } from './publisher';
import { bootstrapRabbitMq } from './bootstrap';

export interface MqDependencies {
  config: MqConfig;
  connection: RabbitMqConnection;
  publisher: MessagePublisher;
  bootstrap: () => Promise<void>;
  getStatus: () => RabbitMqStatus;
}

export const createMqDependencies = (): MqDependencies => {
  const config = buildMqConfig();
  const connection = new RabbitMqConnection(config.url);
  connection.start();

  const publisher = new RabbitMqPublisher(connection, config.publishTimeoutMs);

  return {
    config,
    connection,
    publisher,
    bootstrap: () => bootstrapRabbitMq(connection, config),
    getStatus: () => connection.getStatus()
  };
};
