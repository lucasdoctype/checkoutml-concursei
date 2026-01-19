import { env } from '../../config/env';

export interface RetryQueueConfig {
  name: string;
  ttlMs: number;
  routingKey: string;
}

export interface MqConfig {
  url: string;
  exchange: string;
  dlx: string;
  processQueue: string;
  dlqQueue: string;
  dlqRoutingKey: string;
  retryQueues: RetryQueueConfig[];
  maxAttempts: number;
  publishTimeoutMs: number;
}

const DEFAULT_RETRY_TTLS = [10000, 60000, 600000, 3600000];
const DEFAULT_PUBLISH_TIMEOUT_MS = 5000;

const parseRetryTtls = (value: string): number[] => {
  const parsed = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  if (parsed.length === 0) {
    return DEFAULT_RETRY_TTLS;
  }

  return Array.from(new Set(parsed)).sort((a, b) => a - b);
};

const formatTtlLabel = (ttlMs: number): string => {
  if (ttlMs % 3600000 === 0) {
    return `${ttlMs / 3600000}h`;
  }
  if (ttlMs % 60000 === 0) {
    return `${ttlMs / 60000}m`;
  }
  if (ttlMs % 1000 === 0) {
    return `${ttlMs / 1000}s`;
  }
  return `${ttlMs}ms`;
};

export const buildMqConfig = (): MqConfig => {
  const ttls = parseRetryTtls(env.RETRY_TTLS_MS);
  const retryQueues = ttls.map((ttlMs) => {
    const label = formatTtlLabel(ttlMs);
    return {
      name: `${env.MQ_EXCHANGE_EVENTS}.retry.${label}`,
      ttlMs,
      routingKey: `retry.${label}`
    };
  });

  return {
    url: env.RABBITMQ_URL,
    exchange: env.MQ_EXCHANGE_EVENTS,
    dlx: env.MQ_EXCHANGE_DLX,
    processQueue: env.MQ_QUEUE_PROCESS,
    dlqQueue: env.MQ_QUEUE_DLQ,
    dlqRoutingKey: 'dlq',
    retryQueues,
    maxAttempts: env.MAX_ATTEMPTS,
    publishTimeoutMs: DEFAULT_PUBLISH_TIMEOUT_MS
  };
};
