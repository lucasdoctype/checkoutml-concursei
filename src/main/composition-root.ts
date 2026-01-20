import { env } from '../config/env';
import type { MercadoPagoApiClient } from '../modules/mercadopago/application/ports/MercadoPagoApiClient';
import type { MercadoPagoWebhookRepository } from '../modules/mercadopago/application/ports/MercadoPagoWebhookRepository';
import { createSupabaseClient } from '../infrastructure/db/supabase/client';
import { createPgPool } from '../infrastructure/db/pg/pool';
import { SupabaseMercadoPagoWebhookRepository } from '../infrastructure/db/supabase/repositories/mercadopago-webhook-repository';
import { PgMercadoPagoWebhookRepository } from '../infrastructure/db/pg/repositories/mercadopago-webhook-repository';
import { HttpMercadoPagoApiClient } from '../infrastructure/http/mercadopago/client';
import type { MqDependencies } from '../infrastructure/mq';
import { createMqDependencies } from '../infrastructure/mq';

export interface Repositories {
  mercadopagoWebhookRepository: MercadoPagoWebhookRepository;
}

export interface Clients {
  mercadopagoApiClient: MercadoPagoApiClient;
}

export interface Dependencies {
  repositories: Repositories;
  clients: Clients;
  mq: MqDependencies;
  health: {
    checkDatabase: () => Promise<boolean>;
    checkRabbit: () => Promise<boolean>;
  };
}

const buildMercadoPagoApiClient = (): MercadoPagoApiClient => {
  return new HttpMercadoPagoApiClient({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
    baseUrl: env.MERCADOPAGO_BASE_URL,
    timeoutMs: env.MERCADOPAGO_TIMEOUT_MS
  });
};

const buildSupabaseDependencies = (): Dependencies => {
  const client = createSupabaseClient();
  const apiClient = buildMercadoPagoApiClient();
  const mq = createMqDependencies();

  return {
    repositories: {
      mercadopagoWebhookRepository: new SupabaseMercadoPagoWebhookRepository(client)
    },
    clients: {
      mercadopagoApiClient: apiClient
    },
    mq,
    health: {
      checkDatabase: async () => {
        const { error } = await client.from('presenq_mvp.mercadopago_webhook_events').select('id').limit(1);
        return !error;
      },
      checkRabbit: async () => {
        const status = mq.getStatus();
        return status.connected && status.channelReady;
      }
    }
  };
};

const buildPgDependencies = (): Dependencies => {
  const pool = createPgPool();
  const apiClient = buildMercadoPagoApiClient();
  const mq = createMqDependencies();

  return {
    repositories: {
      mercadopagoWebhookRepository: new PgMercadoPagoWebhookRepository(pool)
    },
    clients: {
      mercadopagoApiClient: apiClient
    },
    mq,
    health: {
      checkDatabase: async () => {
        try {
          await pool.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      },
      checkRabbit: async () => {
        const status = mq.getStatus();
        return status.connected && status.channelReady;
      }
    }
  };
};

export const buildDependencies = (): Dependencies => {
  return env.DATABASE_URL ? buildPgDependencies() : buildSupabaseDependencies();
};
