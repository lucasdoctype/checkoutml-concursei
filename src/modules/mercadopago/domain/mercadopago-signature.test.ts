import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { buildSignaturePayload, validateMercadoPagoSignature } from './mercadopago-signature';

describe('mercadopago signature validation', () => {
  it('accepts a valid signature', () => {
    const secret = 'test-secret';
    const requestId = 'req-123';
    const dataId = 'data-456';
    const timestamp = '1700000000';
    const payload = buildSignaturePayload({ dataId, requestId, timestamp });
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const header = `ts=${timestamp},v1=${signature}`;

    const result = validateMercadoPagoSignature({
      signatureHeader: header,
      secret,
      requestId,
      dataId,
      toleranceSec: 300,
      now: new Date(Number(timestamp) * 1000)
    });

    expect(result.valid).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const result = validateMercadoPagoSignature({
      signatureHeader: 'ts=1700000000,v1=invalid',
      secret: 'test-secret',
      requestId: 'req-123',
      dataId: 'data-456',
      toleranceSec: 300,
      now: new Date(1700000000 * 1000)
    });

    expect(result.valid).toBe(false);
  });

  it('rejects stale timestamps', () => {
    const secret = 'test-secret';
    const requestId = 'req-123';
    const dataId = 'data-456';
    const timestamp = '1700000000';
    const payload = buildSignaturePayload({ dataId, requestId, timestamp });
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const header = `ts=${timestamp},v1=${signature}`;

    const result = validateMercadoPagoSignature({
      signatureHeader: header,
      secret,
      requestId,
      dataId,
      toleranceSec: 10,
      now: new Date(Number(timestamp) * 1000 + 60000)
    });

    expect(result.valid).toBe(false);
  });
});
