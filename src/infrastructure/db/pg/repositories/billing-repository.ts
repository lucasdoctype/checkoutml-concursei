import { Pool } from 'pg';
import type {
  BillingRepository,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionPaymentRecord
} from '../../../../modules/mercadopago/application/ports/BillingRepository';
import type { RecordData } from '../../../../shared/types/records';

const SCHEMA = 'presenq_mvp';
const PLANS_TABLE = `${SCHEMA}.plans`;
const SUBSCRIPTIONS_TABLE = `${SCHEMA}.subscriptions`;
const PAYMENTS_TABLE = `${SCHEMA}.subscription_payments`;

export class PgBillingRepository implements BillingRepository {
  constructor(private readonly pool: Pool) {}

  async findPlanByCode(code: string): Promise<PlanRecord | null> {
    const result = await this.pool.query<PlanRecord>(
      `
        SELECT id, code::text AS code
        FROM ${PLANS_TABLE}
        WHERE code::text = $1
        LIMIT 1
      `,
      [code]
    );

    return result.rows[0] ?? null;
  }

  async findLatestSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const result = await this.pool.query<SubscriptionRecord>(
      `
        SELECT id,
               user_id,
               plan_id,
               status::text AS status
        FROM ${SUBSCRIPTIONS_TABLE}
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId]
    );

    return result.rows[0] ?? null;
  }

  async createSubscription(input: {
    userId: string;
    planId: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionRecord> {
    const result = await this.pool.query<SubscriptionRecord>(
      `
        INSERT INTO ${SUBSCRIPTIONS_TABLE} (
          user_id,
          plan_id,
          status,
          trial_ends_at,
          current_period_start,
          current_period_end
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id,
                  user_id,
                  plan_id,
                  status::text AS status
      `,
      [
        input.userId,
        input.planId,
        input.status,
        input.trialEndsAt,
        input.currentPeriodStart,
        input.currentPeriodEnd
      ]
    );

    return result.rows[0];
  }

  async updateSubscription(input: {
    subscriptionId: string;
    planId: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionRecord> {
    const result = await this.pool.query<SubscriptionRecord>(
      `
        UPDATE ${SUBSCRIPTIONS_TABLE}
        SET plan_id = $2,
            status = $3,
            trial_ends_at = $4,
            current_period_start = $5,
            current_period_end = $6
        WHERE id = $1
        RETURNING id,
                  user_id,
                  plan_id,
                  status::text AS status
      `,
      [
        input.subscriptionId,
        input.planId,
        input.status,
        input.trialEndsAt,
        input.currentPeriodStart,
        input.currentPeriodEnd
      ]
    );

    return result.rows[0];
  }

  async findPaymentByMpId(mpPaymentId: string): Promise<SubscriptionPaymentRecord | null> {
    const result = await this.pool.query<SubscriptionPaymentRecord>(
      `
        SELECT id,
               subscription_id,
               status
        FROM ${PAYMENTS_TABLE}
        WHERE mp_payment_id = $1
        LIMIT 1
      `,
      [mpPaymentId]
    );

    return result.rows[0] ?? null;
  }

  async upsertSubscriptionPayment(input: {
    subscriptionId: string;
    mpPaymentId: string;
    mpMerchantOrderId: string | null;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
    externalReference: string | null;
    raw: RecordData;
  }): Promise<SubscriptionPaymentRecord> {
    const result = await this.pool.query<SubscriptionPaymentRecord>(
      `
        INSERT INTO ${PAYMENTS_TABLE} (
          subscription_id,
          provider,
          mp_payment_id,
          mp_merchant_order_id,
          amount,
          currency,
          status,
          paid_at,
          external_reference,
          raw
        )
        VALUES ($1, 'mercadopago', $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (mp_payment_id) WHERE mp_payment_id IS NOT NULL
        DO UPDATE SET
          status = EXCLUDED.status,
          paid_at = EXCLUDED.paid_at,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          mp_merchant_order_id = COALESCE(EXCLUDED.mp_merchant_order_id, ${PAYMENTS_TABLE}.mp_merchant_order_id),
          external_reference = COALESCE(EXCLUDED.external_reference, ${PAYMENTS_TABLE}.external_reference),
          raw = EXCLUDED.raw
        RETURNING id,
                  subscription_id,
                  status
      `,
      [
        input.subscriptionId,
        input.mpPaymentId,
        input.mpMerchantOrderId,
        input.amount,
        input.currency,
        input.status,
        input.paidAt,
        input.externalReference,
        JSON.stringify(input.raw ?? {})
      ]
    );

    return result.rows[0];
  }
}
