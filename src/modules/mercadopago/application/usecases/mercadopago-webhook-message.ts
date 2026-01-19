import type { RecordData } from '../../../../shared/types/records';

export const buildWebhookRoutingKey = (topic?: string | null, action?: string | null): string => {
  const topicValue = normalizeSegment(topic) ?? 'unknown';
  const actionValue = normalizeSegment(action) ?? 'unknown';
  if (actionValue.startsWith(`${topicValue}.`)) {
    return `mercadopago.${actionValue}`;
  }
  return `mercadopago.${topicValue}.${actionValue}`;
};

export const buildWebhookMessage = (input: {
  eventId: string;
  topic: string | null;
  action: string | null;
  createdAtMp: string | null;
  liveMode: boolean;
  payload: RecordData;
  headers: RecordData;
  requestId?: string;
}): RecordData => {
  return {
    eventId: input.eventId,
    topic: input.topic,
    action: input.action,
    createdAt: input.createdAtMp,
    liveMode: input.liveMode,
    data: input.payload,
    headers: input.headers,
    requestId: input.requestId ?? null
  };
};

const normalizeSegment = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
