import { describe, it, expect } from 'vitest';
import { RepublishFailedWebhooksUseCase } from './republish-failed-webhooks-usecase';
import type { MercadoPagoWebhookRepository } from '../ports/MercadoPagoWebhookRepository';
import type { RecordData } from '../../../../shared/types/records';
import type { MessagePublisher, PublishInput, PublishResult } from '../../../../shared/mq/message-publisher';

class InMemoryWebhookRepository implements MercadoPagoWebhookRepository {
  private readonly events: RecordData[] = [];

  constructor(seed: RecordData[]) {
    this.events = [...seed];
  }

  async findByEventId(eventId: string): Promise<RecordData | null> {
    return this.events.find((event) => event.mercadopago_event_id === eventId) ?? null;
  }

  async create(input: RecordData): Promise<RecordData> {
    const event = { ...input, id: input.mercadopago_event_id };
    this.events.push(event);
    return event;
  }

  async updateStatusByEventId(
    eventId: string,
    input: { status?: string; lastError?: string | null; incrementAttempts?: boolean }
  ): Promise<RecordData> {
    const event = this.events.find((item) => item.mercadopago_event_id === eventId);
    if (!event) {
      throw new Error('event_not_found');
    }
    if (input.status) {
      event.status = input.status;
    }
    if (input.lastError !== undefined) {
      event.last_error = input.lastError;
    }
    if (input.incrementAttempts) {
      event.process_attempts = Number(event.process_attempts ?? 0) + 1;
    }
    return event;
  }

  async listFailed(limit: number): Promise<RecordData[]> {
    return this.events.filter((event) => event.status === 'FAILED').slice(0, limit);
  }

  getAll(): RecordData[] {
    return this.events;
  }
}

class FakePublisher implements MessagePublisher {
  public published: PublishInput[] = [];
  public shouldFail = false;

  async publish(input: PublishInput): Promise<PublishResult> {
    this.published.push(input);
    if (this.shouldFail) {
      return { published: false, error: 'publish_failed' };
    }
    return { published: true, messageId: input.messageId };
  }
}

describe('RepublishFailedWebhooksUseCase', () => {
  it('republishes failed events and marks them as processed', async () => {
    const repository = new InMemoryWebhookRepository([
      {
        mercadopago_event_id: 'evt_1',
        topic: 'payment',
        action: 'payment.created',
        created_at_mp: '2024-01-01T00:00:00.000Z',
        live_mode: false,
        payload_raw: { id: 'evt_1', type: 'payment' },
        headers_raw: { 'x-request-id': 'req-1' },
        status: 'FAILED',
        process_attempts: 1
      }
    ]);
    const publisher = new FakePublisher();
    const useCase = new RepublishFailedWebhooksUseCase(repository, publisher, {
      exchange: 'mercadopago.events',
      dlx: 'mercadopago.dlx',
      dlqRoutingKey: 'dlq',
      maxAttempts: 5,
      batchSize: 10
    });

    const result = await useCase.execute();

    expect(result.succeeded).toBe(1);
    expect(repository.getAll()[0].status).toBe('PROCESSED');
    expect(repository.getAll()[0].last_error).toBe(null);
  });

  it('increments attempts and keeps FAILED when publish fails', async () => {
    const repository = new InMemoryWebhookRepository([
      {
        mercadopago_event_id: 'evt_2',
        topic: 'payment',
        action: 'payment.updated',
        created_at_mp: '2024-01-01T00:00:00.000Z',
        live_mode: true,
        payload_raw: { id: 'evt_2', type: 'payment' },
        headers_raw: {},
        status: 'FAILED',
        process_attempts: 0
      }
    ]);
    const publisher = new FakePublisher();
    publisher.shouldFail = true;

    const useCase = new RepublishFailedWebhooksUseCase(repository, publisher, {
      exchange: 'mercadopago.events',
      dlx: 'mercadopago.dlx',
      dlqRoutingKey: 'dlq',
      maxAttempts: 5,
      batchSize: 10
    });

    const result = await useCase.execute();

    expect(result.failed).toBe(1);
    expect(repository.getAll()[0].status).toBe('FAILED');
    expect(Number(repository.getAll()[0].process_attempts)).toBe(1);
  });

  it('sends to DLQ when max attempts reached', async () => {
    const repository = new InMemoryWebhookRepository([
      {
        mercadopago_event_id: 'evt_3',
        topic: 'payment',
        action: 'payment.cancelled',
        created_at_mp: '2024-01-01T00:00:00.000Z',
        live_mode: true,
        payload_raw: { id: 'evt_3', type: 'payment' },
        headers_raw: {},
        status: 'FAILED',
        process_attempts: 5
      }
    ]);
    const publisher = new FakePublisher();
    const useCase = new RepublishFailedWebhooksUseCase(repository, publisher, {
      exchange: 'mercadopago.events',
      dlx: 'mercadopago.dlx',
      dlqRoutingKey: 'dlq',
      maxAttempts: 5,
      batchSize: 10
    });

    const result = await useCase.execute();

    expect(result.sentToDlq).toBe(1);
    expect(repository.getAll()[0].status).toBe('FAILED');
    expect(repository.getAll()[0].last_error).toBe('max_attempts_reached');
    expect(publisher.published[0].exchange).toBe('mercadopago.dlx');
  });
});
