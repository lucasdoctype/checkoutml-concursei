import { createHmac, timingSafeEqual } from 'crypto';

export interface MercadoPagoSignatureInput {
  signatureHeader?: string;
  secret: string;
  requestId?: string;
  dataId?: string;
  toleranceSec: number;
  now?: Date;
}

export interface MercadoPagoSignatureResult {
  valid: boolean;
  reason?: string;
  details?: {
    timestamp?: string;
    signature?: string;
    expected?: string;
    payload?: string;
  };
}

export const validateMercadoPagoSignature = (input: MercadoPagoSignatureInput): MercadoPagoSignatureResult => {
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) {
    return { valid: false, reason: 'missing_signature' };
  }

  if (!input.requestId) {
    return {
      valid: false,
      reason: 'missing_request_id',
      details: { timestamp: parsed.ts, signature: parsed.v1 }
    };
  }

  if (!input.dataId) {
    return {
      valid: false,
      reason: 'missing_data_id',
      details: { timestamp: parsed.ts, signature: parsed.v1 }
    };
  }

  if (!isTimestampValid(parsed.ts, input.toleranceSec, input.now)) {
    return {
      valid: false,
      reason: 'timestamp_out_of_range',
      details: { timestamp: parsed.ts, signature: parsed.v1 }
    };
  }

  const signaturePayload = buildSignaturePayload({
    dataId: input.dataId,
    requestId: input.requestId,
    timestamp: parsed.ts
  });

  const expected = createHmac('sha256', input.secret).update(signaturePayload).digest('hex');
  const actual = parsed.v1;
  const valid = safeCompare(expected, actual);

  if (!valid) {
    return {
      valid: false,
      reason: 'signature_mismatch',
      details: {
        timestamp: parsed.ts,
        signature: actual,
        expected,
        payload: signaturePayload
      }
    };
  }


  return {
    valid: true,
    details: {
      timestamp: parsed.ts,
      signature: actual,
      expected,
      payload: signaturePayload
    }
  };
};

export const buildSignaturePayload = (input: {
  dataId: string;
  requestId: string;
  timestamp: string;
}): string => {
  return `id:${input.dataId};request-id:${input.requestId};ts:${input.timestamp};`;
};

const parseSignatureHeader = (header?: string): { ts: string; v1: string } | null => {
  if (!header) return null;
  const parts = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let ts: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }

  if (!ts || !v1) return null;
  return { ts, v1 };
};

const isTimestampValid = (timestamp: string, toleranceSec: number, now = new Date()): boolean => {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const tsMs = ts > 1_000_000_000_000 ? ts : ts * 1000;
  const diffSec = Math.abs(now.getTime() - tsMs) / 1000;
  return diffSec <= toleranceSec;
};


const safeCompare = (expected: string, actual: string): boolean => {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(actual, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
};
