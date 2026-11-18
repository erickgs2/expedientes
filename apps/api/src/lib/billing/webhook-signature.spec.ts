import { createHmac } from 'crypto';
import { verifyStripeSignature } from './webhook-signature';

const SECRET = 'whsec_test';
const BODY = '{"id":"evt_1","type":"invoice.paid"}';
const sign = (t: number, body = BODY, secret = SECRET) =>
  createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

describe('verifyStripeSignature', () => {
  const now = 1_800_000_000;

  it('accepts a valid signature', () => {
    expect(verifyStripeSignature(BODY, `t=${now},v1=${sign(now)}`, SECRET, now)).toBe(true);
  });

  it('accepts when any of several v1 signatures matches (secret rotation)', () => {
    expect(verifyStripeSignature(BODY, `t=${now},v1=${'0'.repeat(64)},v1=${sign(now)}`, SECRET, now)).toBe(true);
  });

  it('refuses a changed body, another secret, or no signature', () => {
    expect(verifyStripeSignature(BODY + ' ', `t=${now},v1=${sign(now)}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${now},v1=${sign(now, BODY, 'whsec_other')}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, null, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${now}`, SECRET, now)).toBe(false);
  });

  it('refuses old or future timestamps beyond the tolerance', () => {
    expect(verifyStripeSignature(BODY, `t=${now - 301},v1=${sign(now - 301)}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${now + 301},v1=${sign(now + 301)}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${now - 299},v1=${sign(now - 299)}`, SECRET, now)).toBe(true);
  });
});
