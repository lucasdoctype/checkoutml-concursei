import * as amqp from 'amqplib';
import type { ConfirmChannel } from 'amqplib';
import { logger } from '../../shared/logging/logger';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
export interface RabbitMqStatus {
  connected: boolean;
  channelReady: boolean;
}
export class RabbitMqConnection {
  private connection: AmqpConnection | null = null;
  private channel: ConfirmChannel | null = null;

  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  constructor(private readonly url: string) { }

  start(): void {
    void this.connect();
  }

  async ensureChannel(): Promise<ConfirmChannel | null> {
    await this.connect();
    return this.channel;
  }

  private async connect(): Promise<void> {
    if (this.channel) return;

    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = (async () => {
      try {
        const connection = await amqp.connect(this.url);


        const confirmChannelFactory = (connection as any).createConfirmChannel?.bind(connection);
        if (!confirmChannelFactory) {
          throw new Error('createConfirmChannel_not_available');
        }

        connection.on('error', (error: unknown) => {
          logger.error({ err: error }, 'rabbitmq_connection_error');
        });

        connection.on('close', () => {
          logger.warn('rabbitmq_connection_closed');
          this.cleanup();
          this.scheduleReconnect();
        });

        const channel = (await confirmChannelFactory()) as ConfirmChannel;

        channel.on('error', (error: unknown) => {
          logger.error({ err: error }, 'rabbitmq_channel_error');
        });

        channel.on('close', () => {
          logger.warn('rabbitmq_channel_closed');
          this.channel = null;
          this.scheduleReconnect();
        });

        this.connection = connection as AmqpConnection;
        this.channel = channel;
        this.reconnectAttempts = 0;

        logger.info('rabbitmq_connected');
      } catch (error) {
        logger.error({ err: error }, 'rabbitmq_connect_failed');
        this.cleanup();
        this.scheduleReconnect();
      }
    })();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private cleanup(): void {
    this.channel = null;
    this.connection = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const baseDelay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    const jitter = Math.floor(Math.random() * 250);
    const delay = baseDelay + jitter;

    this.reconnectAttempts += 1;
    logger.info({ delay_ms: delay }, 'rabbitmq_reconnect_scheduled');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
