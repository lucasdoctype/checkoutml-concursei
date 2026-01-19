import { env } from '../config/env';
import type { MercadoPagoApiClient } from '../modules/mercadopago/application/ports/MercadoPagoApiClient';
import type { MercadoPagoWebhookRepository } from '../modules/mercadopago/application/ports/MercadoPagoWebhookRepository';
import { createSupabaseClient } from '../infrastructure/db/supabase/client';
import { createPgPool } from '../infrastructure/db/pg/pool';
import { SupabaseMercadoPagoWebhookRepository } from '../infrastructure/db/supabase/repositories/mercadopago-webhook-repository';
import { PgMercadoPagoWebhookRepository } from '../infrastructure/db/pg/repositories/mercadopago-webhook-repository';
import { HttpMercadoPagoApiClient } from '../infrastructure/http/mercadopago/client';

export interface Repositories {
  mercadopagoWebhookRepository: MercadoPagoWebhookRepository;
}

export interface Clients {
  mercadopagoApiClient: MercadoPagoApiClient;
}

export interface Dependencies {
  repositories: Repositories;
  clients: Clients;
  health: {
    checkDatabase: () => Promise<boolean>;
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

  return {
    repositories: {
      mercadopagoWebhookRepository: new SupabaseMercadoPagoWebhookRepository(client)
    },
    clients: {
      mercadopagoApiClient: apiClient
    },
    health: {
      checkDatabase: async () => {
        const { error } = await client.from('mercadopago_webhook_events').select('id').limit(1);
        return !error;
      }
    }
  };
};

const buildPgDependencies = (): Dependencies => {
  const pool = createPgPool();
  const apiClient = buildMercadoPagoApiClient();

  return {
    repositories: {
      mercadopagoWebhookRepository: new PgMercadoPagoWebhookRepository(pool)
    },
    clients: {
      mercadopagoApiClient: apiClient
    },
    health: {
      checkDatabase: async () => {
        try {
          await pool.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      }
    }
  };
};

export const buildDependencies = (): Dependencies => {
  return env.DATABASE_URL ? buildPgDependencies() : buildSupabaseDependencies();
};
