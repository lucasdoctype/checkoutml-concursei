import type { RecordData } from '../types/records';

export interface PublishInput {
  exchange: string;
  routingKey: string;
  payload: RecordData;
  headers?: Record<string, unknown>;
  messageId?: string;
  correlationId?: string;
  timeoutMs?: number;
}

export interface PublishResult {
  published: boolean;
  messageId?: string;
  error?: string;
}

export interface MessagePublisher {
  publish(input: PublishInput): Promise<PublishResult>;
}
