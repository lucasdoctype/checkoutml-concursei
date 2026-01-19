import { Pool } from 'pg';
import { env } from '../../../config/env';

export const createPgPool = (): Pool => {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PgAdapter');
  }

  return new Pool({
    connectionString: env.DATABASE_URL
  });
};
