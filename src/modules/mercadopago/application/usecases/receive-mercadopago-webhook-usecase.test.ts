import { describe, it, expect } from 'vitest';
import { ReceiveMercadoPagoWebhookUseCase } from './receive-mercadopago-webhook-usecase';
import type { MercadoPagoWebhookRepository } from '../ports/MercadoPagoWebhookRepository';
import type { RecordData } from '../../../../shared/types/records';
import type { MessagePublisher, PublishInput, PublishResult } from '../../../../shared/mq/message-publisher';

class InMemoryWebhookRepository implements MercadoPagoWebhookRepository {
  private readonly events: RecordData[] = [];

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

  get size(): number {
    return this.events.length;
  }

  get latest(): RecordData | null {
    return this.events[this.events.length - 1] ?? null;
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

describe('ReceiveMercadoPagoWebhookUseCase', () => {
  it('stores a new webhook event', async () => {
    const repository = new InMemoryWebhookRepository();
    const publisher = new FakePublisher();
    const useCase = new ReceiveMercadoPagoWebhookUseCase(repository, publisher, 'mercadopago.events');

    const result = await useCase.execute({
      payload: {
        id: 'evt_1',
        type: 'payment',
        action: 'payment.created',
        data: { id: 'pay_1' },
        live_mode: false
      },
      headers: {
        'x-request-id': 'req-1'
      },
      requestId: 'req-1'
    });

    expect(result.created).toBe(true);
    expect(result.published).toBe(true);
    expect(result.status).toBe('PROCESSED');
    expect(repository.size).toBe(1);
    expect(result.event.mercadopago_event_id).toBe('evt_1');
    expect(publisher.published.length).toBe(1);
    expect(repository.latest?.status).toBe('PROCESSED');
  });

  it('returns existing event for duplicates', async () => {
    const repository = new InMemoryWebhookRepository();
    const publisher = new FakePublisher();
    const useCase = new ReceiveMercadoPagoWebhookUseCase(repository, publisher, 'mercadopago.events');

    await useCase.execute({
      payload: {
        id: 'evt_2',
        type: 'payment',
        action: 'payment.updated',
        data: { id: 'pay_2' },
        live_mode: true
      },
      headers: {},
      requestId: 'req-2'
    });

    const second = await useCase.execute({
      payload: {
        id: 'evt_2',
        type: 'payment',
        action: 'payment.updated',
        data: { id: 'pay_2' },
        live_mode: true
      },
      headers: {},
      requestId: 'req-2'
    });

    expect(second.created).toBe(false);
    expect(second.published).toBe(false);
    expect(repository.size).toBe(1);
    expect(publisher.published.length).toBe(1);
  });

  it('marks event as failed when publish fails', async () => {
    const repository = new InMemoryWebhookRepository();
    const publisher = new FakePublisher();
    publisher.shouldFail = true;
    const useCase = new ReceiveMercadoPagoWebhookUseCase(repository, publisher, 'mercadopago.events');

    const result = await useCase.execute({
      payload: {
        id: 'evt_3',
        type: 'payment',
        action: 'payment.created',
        data: { id: 'pay_3' },
        live_mode: false
      },
      headers: {},
      requestId: 'req-3'
    });

    expect(result.published).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(repository.latest?.status).toBe('FAILED');
    expect(Number(repository.latest?.process_attempts ?? 0)).toBe(1);
  });

  it('throws when repository fails', async () => {
    const repository: MercadoPagoWebhookRepository = {
      findByEventId: async () => null,
      create: async () => {
        throw new Error('db down');
      },
      updateStatusByEventId: async () => {
        throw new Error('db down');
      },
      listFailed: async () => []
    };

    const useCase = new ReceiveMercadoPagoWebhookUseCase(
      repository,
      { publish: async () => ({ published: true }) },
      'mercadopago.events'
    );

    await expect(
      useCase.execute({
        payload: { id: 'evt_3', data: { id: 'pay_3' } },
        headers: {},
        requestId: 'req-3'
      })
    ).rejects.toThrow('Erro ao registrar webhook');
  });
});
