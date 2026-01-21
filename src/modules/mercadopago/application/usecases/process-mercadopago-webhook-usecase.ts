import { logger } from '../../../../shared/logging/logger';
import type { RecordData } from '../../../../shared/types/records';
import type { MercadoPagoApiClient } from '../ports/MercadoPagoApiClient';
import type { BillingRepository, SubscriptionRecord } from '../ports/BillingRepository';

export type ProcessWebhookResult = {
  status: 'processed' | 'ignored';
  reason?: string;
  paymentId?: string;
  paymentStatus?: string;
  userId?: string;
  planCode?: string;
  subscriptionId?: string;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'past_due']);

export class ProcessMercadoPagoWebhookUseCase {
  constructor(
    private readonly apiClient: MercadoPagoApiClient,
    private readonly billingRepository: BillingRepository
  ) {}

  async execute(message: RecordData): Promise<ProcessWebhookResult> {
    const payload = resolveMessagePayload(message);
    const topic = asString(message.topic) ?? asString(payload.topic ?? payload.type);
    const action = asString(message.action ?? payload.action);
    const eventType = resolveEventType(topic, action);

    if (eventType === 'unknown') {
      return { status: 'ignored', reason: 'unsupported_topic' };
    }

    const paymentDetails =
      eventType === 'merchant_order'
        ? await resolvePaymentFromMerchantOrder(this.apiClient, payload)
        : await resolvePaymentFromNotification(this.apiClient, payload);

    if (!paymentDetails) {
      return { status: 'ignored', reason: 'payment_not_found' };
    }

    const payment = paymentDetails.payment;
    const paymentId = paymentDetails.paymentId;
    const paymentStatus = asString(payment.status) ?? 'unknown';
    const externalReference =
      asString(payment.external_reference) ?? paymentDetails.externalReference ?? null;

    const { userId, planCode } = resolveCheckoutMetadata(payment.metadata, externalReference);

    if (!userId || !planCode) {
      throw new Error('missing_checkout_metadata');
    }

    const plan = await this.billingRepository.findPlanByCode(planCode);
    if (!plan) {
      throw new Error(`plan_not_found:${planCode}`);
    }

    const amount = resolvePaymentAmount(payment);
    if (amount === null) {
      throw new Error('missing_payment_amount');
    }

    const currency =
      asString(payment.currency_id) ?? asString(payment.transaction_currency_id) ?? 'BRL';

    const paidAt =
      paymentStatus === 'approved' ? parseDate(payment.date_approved ?? payment.date_created) : null;

    const now = new Date();
    const { currentPeriodStart, currentPeriodEnd } = buildBillingPeriod(planCode, now);

    const existingSubscription = await this.billingRepository.findLatestSubscriptionByUserId(userId);
    const canUpdate = existingSubscription
      ? ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)
      : false;

    let subscription: SubscriptionRecord | null = existingSubscription;

    if (paymentStatus === 'approved') {
      subscription = canUpdate
        ? await this.billingRepository.updateSubscription({
            subscriptionId: existingSubscription!.id,
            planId: plan.id,
            status: 'active',
            trialEndsAt: null,
            currentPeriodStart,
            currentPeriodEnd
          })
        : await this.billingRepository.createSubscription({
            userId,
            planId: plan.id,
            status: 'active',
            trialEndsAt: null,
            currentPeriodStart,
            currentPeriodEnd
          });
    } else if (!canUpdate) {
      logger.info(
        {
          payment_id: paymentId,
          status: paymentStatus,
          user_id: userId
        },
        'mercadopago_payment_not_approved'
      );
      return {
        status: 'ignored',
        reason: `payment_status_${paymentStatus}`,
        paymentId,
        paymentStatus
      };
    }

    if (!subscription) {
      throw new Error('subscription_unresolved');
    }

    await this.billingRepository.upsertSubscriptionPayment({
      subscriptionId: subscription.id,
      mpPaymentId: paymentId,
      mpMerchantOrderId:
        paymentDetails.merchantOrderId ?? resolveMerchantOrderIdFromPayment(payment),
      amount,
      currency,
      status: paymentStatus,
      paidAt,
      externalReference,
      raw: payment
    });

    return {
      status: 'processed',
      paymentId,
      paymentStatus,
      userId,
      planCode,
      subscriptionId: subscription.id
    };
  }
}

const resolveMessagePayload = (message: RecordData): RecordData => {
  if (isRecord(message.data)) {
    return message.data as RecordData;
  }
  return message;
};

const resolveEventType = (topic: string | null, action: string | null): 'payment' | 'merchant_order' | 'unknown' => {
  const candidate = `${topic ?? ''}:${action ?? ''}`.toLowerCase();
  if (candidate.includes('merchant_order')) {
    return 'merchant_order';
  }
  if (candidate.includes('payment')) {
    return 'payment';
  }
  return 'unknown';
};

const resolvePaymentFromNotification = async (
  apiClient: MercadoPagoApiClient,
  payload: RecordData
): Promise<{
  payment: RecordData;
  paymentId: string;
  merchantOrderId: string | null;
  externalReference: string | null;
} | null> => {
  const paymentId = resolvePaymentId(payload);
  if (!paymentId) return null;

  const payment = await apiClient.getPayment(paymentId);
  return {
    payment,
    paymentId,
    merchantOrderId: resolveMerchantOrderIdFromPayment(payment),
    externalReference: asString(payment.external_reference)
  };
};

const resolvePaymentFromMerchantOrder = async (
  apiClient: MercadoPagoApiClient,
  payload: RecordData
): Promise<{
  payment: RecordData;
  paymentId: string;
  merchantOrderId: string | null;
  externalReference: string | null;
} | null> => {
  const resource = asString(payload.resource) ?? asString(getNested(payload, ['data', 'id']));
  if (!resource) return null;

  const order = await apiClient.getMerchantOrder(resource);
  const merchantOrderId = asString(order.id) ?? extractResourceId(resource);
  const paymentId = resolvePaymentIdFromOrder(order);
  if (!paymentId) {
    return null;
  }

  const payment = await apiClient.getPayment(paymentId);
  return {
    payment,
    paymentId,
    merchantOrderId,
    externalReference: asString(payment.external_reference) ?? asString(order.external_reference)
  };
};

const resolvePaymentId = (payload: RecordData): string | null => {
  const candidate = asString(getNested(payload, ['data', 'id'])) ?? asString(payload.resource);
  if (!candidate) return null;
  return extractResourceId(candidate);
};

const resolvePaymentIdFromOrder = (order: RecordData): string | null => {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const approved = payments.find((entry) => isRecord(entry) && asString(entry.status) === 'approved');
  const candidate = approved ?? payments.find((entry) => isRecord(entry)) ?? null;
  if (!candidate) return null;
  return extractResourceId(asString((candidate as RecordData).id));
};

const resolveMerchantOrderIdFromPayment = (payment: RecordData): string | null => {
  const orderId = asString(payment.order_id) ?? asString(getNested(payment, ['order', 'id']));
  if (!orderId) return null;
  return extractResourceId(orderId);
};

const resolveCheckoutMetadata = (
  metadata: unknown,
  externalReference: string | null
): { userId: string | null; planCode: string | null } => {
  const meta = isRecord(metadata) ? (metadata as RecordData) : {};
  const userId =
    asString(meta.userId) ??
    asString(meta.user_id) ??
    asString(meta.user) ??
    parseExternalReference(externalReference).userId;
  const planCode =
    asString(meta.planCode) ??
    asString(meta.plan_code) ??
    asString(meta.plan) ??
    parseExternalReference(externalReference).planCode;

  return {
    userId: userId && isUuid(userId) ? userId : null,
    planCode: planCode ? planCode.trim().toUpperCase() : null
  };
};

const resolvePaymentAmount = (payment: RecordData): number | null => {
  const transactionAmount = asNumber(payment.transaction_amount);
  if (transactionAmount !== null) {
    return transactionAmount;
  }

  const totalPaid = asNumber(getNested(payment, ['transaction_details', 'total_paid_amount']));
  if (totalPaid !== null) {
    return totalPaid;
  }

  return asNumber(payment.total_paid_amount);
};

const buildBillingPeriod = (
  planCode: string,
  now: Date
): { currentPeriodStart: string; currentPeriodEnd: string } => {
  const start = new Date(now);
  const end = new Date(now);
  if (isAnnualPlanCode(planCode)) {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  return {
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end.toISOString()
  };
};

const parseExternalReference = (
  value: string | null
): { userId: string | null; planCode: string | null } => {
  if (!value) {
    return { userId: null, planCode: null };
  }

  let userId: string | null = null;
  let planCode: string | null = null;

  const parts = value.split('|');
  for (const part of parts) {
    const [key, ...rest] = part.split(':');
    if (!key || rest.length === 0) continue;
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = rest.join(':').trim();
    if (!normalizedValue) continue;

    if (normalizedKey === 'user' || normalizedKey === 'user_id' || normalizedKey === 'userid') {
      userId = normalizedValue;
    }

    if (normalizedKey === 'plan' || normalizedKey === 'plan_code' || normalizedKey === 'plancode') {
      planCode = normalizedValue.toUpperCase();
    }
  }

  return { userId, planCode };
};

const extractResourceId = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return lastSegment(url.pathname);
    } catch {
      // Fall through.
    }
  }

  return lastSegment(trimmed);
};

const lastSegment = (value: string): string | null => {
  const cleaned = value.split('?')[0];
  const parts = cleaned.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
};

const getNested = (value: unknown, path: string[]): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as RecordData)[key];
  }
  return current ?? null;
};

const asString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const isAnnualPlanCode = (value: string): boolean => value.toUpperCase().endsWith('_ANUAL');

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const isRecord = (value: unknown): value is RecordData =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
