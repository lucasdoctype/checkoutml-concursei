import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BillingRepository,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionPaymentRecord
} from '../../../../modules/mercadopago/application/ports/BillingRepository';
import type { RecordData } from '../../../../shared/types/records';

const SCHEMA = 'presenq_mvp';
const PLANS_TABLE = 'plans';
const SUBSCRIPTIONS_TABLE = 'subscriptions';
const PAYMENTS_TABLE = 'subscription_payments';

export class SupabaseBillingRepository implements BillingRepository {
  constructor(private readonly client: SupabaseClient) {}

  private table(table: string) {
    return this.client.schema(SCHEMA).from(table);
  }

  async findPlanByCode(code: string): Promise<PlanRecord | null> {
    const { data, error } = await this.table(PLANS_TABLE)
      .select('id, code')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;
    return (data as PlanRecord | null) ?? null;
  }

  async findLatestSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const { data, error } = await this.table(SUBSCRIPTIONS_TABLE)
      .select('id, user_id, plan_id, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (data as SubscriptionRecord | null) ?? null;
  }

  async createSubscription(input: {
    userId: string;
    planId: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionRecord> {
    const { data, error } = await this.table(SUBSCRIPTIONS_TABLE)
      .insert({
        user_id: input.userId,
        plan_id: input.planId,
        status: input.status,
        trial_ends_at: input.trialEndsAt,
        current_period_start: input.currentPeriodStart,
        current_period_end: input.currentPeriodEnd
      })
      .select('id, user_id, plan_id, status')
      .single();

    if (error) throw error;
    return data as SubscriptionRecord;
  }

  async updateSubscription(input: {
    subscriptionId: string;
    planId: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionRecord> {
    const { data, error } = await this.table(SUBSCRIPTIONS_TABLE)
      .update({
        plan_id: input.planId,
        status: input.status,
        trial_ends_at: input.trialEndsAt,
        current_period_start: input.currentPeriodStart,
        current_period_end: input.currentPeriodEnd
      })
      .eq('id', input.subscriptionId)
      .select('id, user_id, plan_id, status')
      .single();

    if (error) throw error;
    return data as SubscriptionRecord;
  }

  async findPaymentByMpId(mpPaymentId: string): Promise<SubscriptionPaymentRecord | null> {
    const { data, error } = await this.table(PAYMENTS_TABLE)
      .select('id, subscription_id, status')
      .eq('mp_payment_id', mpPaymentId)
      .maybeSingle();

    if (error) throw error;
    return (data as SubscriptionPaymentRecord | null) ?? null;
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
    const { data, error } = await this.table(PAYMENTS_TABLE)
      .upsert(
        {
          subscription_id: input.subscriptionId,
          provider: 'mercadopago',
          mp_payment_id: input.mpPaymentId,
          mp_merchant_order_id: input.mpMerchantOrderId,
          amount: input.amount,
          currency: input.currency,
          status: input.status,
          paid_at: input.paidAt,
          external_reference: input.externalReference,
          raw: input.raw ?? {}
        },
        { onConflict: 'mp_payment_id' }
      )
      .select('id, subscription_id, status')
      .single();

    if (error) throw error;
    return data as SubscriptionPaymentRecord;
  }
}
