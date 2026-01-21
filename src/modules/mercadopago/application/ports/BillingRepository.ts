import type { RecordData } from '../../../../shared/types/records';

export interface PlanRecord {
  id: string;
  code: string;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
}

export interface SubscriptionPaymentRecord {
  id: string;
  subscription_id: string;
  status: string;
}

export interface BillingRepository {
  findPlanByCode(code: string): Promise<PlanRecord | null>;
  findLatestSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null>;
  createSubscription(input: {
    userId: string;
    planId: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionRecord>;
  updateSubscription(input: {
    subscriptionId: string;
    planId: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionRecord>;
  findPaymentByMpId(mpPaymentId: string): Promise<SubscriptionPaymentRecord | null>;
  upsertSubscriptionPayment(input: {
    subscriptionId: string;
    mpPaymentId: string;
    mpMerchantOrderId: string | null;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
    externalReference: string | null;
    raw: RecordData;
  }): Promise<SubscriptionPaymentRecord>;
}
