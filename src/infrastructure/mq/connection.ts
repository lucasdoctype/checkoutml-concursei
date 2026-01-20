import amqp, { ConfirmChannel, Connection } from 'amqplib';
import { logger } from '../../shared/logging/logger';

export interface RabbitMqStatus {
  connected: boolean;
  channelReady: boolean;
}

export class RabbitMqConnection {
  private connection: Connection | null = null;
  private channel: ConfirmChannel | null = null;

  private connectPromise: Promise<void> | null = null; // <-- ADICIONE
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  constructor(private readonly url: string) {}

  start(): void {
    void this.connect(); // ok
  }

  async ensureChannel(): Promise<ConfirmChannel | null> {
    await this.connect();          // <-- garante que aguardará a promise em andamento
    return this.channel;
  }

  private async connect(): Promise<void> {
    if (this.channel) return;

    // Se já tem tentativa em andamento, aguarde ela
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = (async () => {
      try {
        const connection = await amqp.connect(this.url);

        connection.on('error', (error) => {
          logger.error({ err: error }, 'rabbitmq_connection_error');
        });

        connection.on('close', () => {
          logger.warn('rabbitmq_connection_closed');
          this.cleanup();
          this.scheduleReconnect();
        });

        const channel = await connection.createConfirmChannel();

        channel.on('error', (error) => {
          logger.error({ err: error }, 'rabbitmq_channel_error');
        });

        channel.on('close', () => {
          logger.warn('rabbitmq_channel_closed');
          this.channel = null;
          this.scheduleReconnect();
        });

        this.connection = connection;
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
