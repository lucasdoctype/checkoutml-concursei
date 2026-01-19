import { describe, it, expect } from 'vitest';
import { ReceiveMercadoPagoWebhookUseCase } from './receive-mercadopago-webhook-usecase';
import type { MercadoPagoWebhookRepository } from '../ports/MercadoPagoWebhookRepository';
import type { RecordData } from '../../../../shared/types/records';

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

  get size(): number {
    return this.events.length;
  }
}

describe('ReceiveMercadoPagoWebhookUseCase', () => {
  it('stores a new webhook event', async () => {
    const repository = new InMemoryWebhookRepository();
    const useCase = new ReceiveMercadoPagoWebhookUseCase(repository);

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
      }
    });

    expect(result.created).toBe(true);
    expect(repository.size).toBe(1);
    expect(result.event.mercadopago_event_id).toBe('evt_1');
  });

  it('returns existing event for duplicates', async () => {
    const repository = new InMemoryWebhookRepository();
    const useCase = new ReceiveMercadoPagoWebhookUseCase(repository);

    await useCase.execute({
      payload: {
        id: 'evt_2',
        type: 'payment',
        action: 'payment.updated',
        data: { id: 'pay_2' },
        live_mode: true
      },
      headers: {}
    });

    const second = await useCase.execute({
      payload: {
        id: 'evt_2',
        type: 'payment',
        action: 'payment.updated',
        data: { id: 'pay_2' },
        live_mode: true
      },
      headers: {}
    });

    expect(second.created).toBe(false);
    expect(repository.size).toBe(1);
  });

  it('throws when repository fails', async () => {
    const repository: MercadoPagoWebhookRepository = {
      findByEventId: async () => null,
      create: async () => {
        throw new Error('db down');
      }
    };

    const useCase = new ReceiveMercadoPagoWebhookUseCase(repository);

    await expect(
      useCase.execute({
        payload: { id: 'evt_3', data: { id: 'pay_3' } },
        headers: {}
      })
    ).rejects.toThrow('Erro ao registrar webhook');
  });
});
