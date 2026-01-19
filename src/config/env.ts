import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const urlWithDefault = (value: string) =>
  z.preprocess(emptyToUndefined, z.string().url().default(value));
const booleanDefaultTrue = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return value;
}, z.boolean().default(true));

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    API_BASE_PATH: z.string().default('/functions/v1'),
    SUPABASE_URL: optionalUrl,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    DATABASE_URL: optionalUrl,
    SUPABASE_DB_URL: optionalUrl,
    CORS_ORIGIN: optionalString,
    LOG_LEVEL: optionalString,
    MERCADOPAGO_ACCESS_TOKEN: optionalString,
    MERCADOPAGO_WEBHOOK_SECRET: optionalString,
    MERCADOPAGO_WEBHOOK_TOLERANCE_SEC: z.coerce.number().int().positive().default(300),
    MERCADOPAGO_WEBHOOK_STRICT_SIGNATURE: booleanDefaultTrue,
    MERCADOPAGO_BASE_URL: urlWithDefault('https://api.mercadopago.com'),
    MERCADOPAGO_NOTIFICATION_URL: optionalUrl,
    MERCADOPAGO_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    RABBITMQ_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().default('amqp://guest:guest@localhost:5672')
    ),
    MQ_EXCHANGE_EVENTS: z.string().default('mercadopago.events'),
    MQ_EXCHANGE_DLX: z.string().default('mercadopago.dlx'),
    MQ_QUEUE_PROCESS: z.string().default('mercadopago.events.process'),
    MQ_QUEUE_DLQ: z.string().default('mercadopago.events.dlq'),
    RETRY_TTLS_MS: z.string().default('10000,60000,600000,3600000'),
    MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    INTERNAL_API_TOKEN: optionalString
  })
  .superRefine((value, ctx) => {
    if (!value.DATABASE_URL) {
      if (!value.SUPABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SUPABASE_URL is required when DATABASE_URL is not set',
          path: ['SUPABASE_URL']
        });
      }
      if (!value.SUPABASE_SERVICE_ROLE_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SUPABASE_SERVICE_ROLE_KEY is required when DATABASE_URL is not set',
          path: ['SUPABASE_SERVICE_ROLE_KEY']
        });
      }
    }
  });

const rawEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL
};

export const env = envSchema.parse(rawEnv);
