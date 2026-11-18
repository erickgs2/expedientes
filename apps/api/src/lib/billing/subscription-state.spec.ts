import { extendPrepaidPeriod, graceEnd, readStripeSubscription, type StripeSubscription } from './subscription-state';

const END = 1_800_000_000;
const base = (extra: Partial<StripeSubscription>): StripeSubscription => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  items: { data: [{ current_period_end: END, price: { id: 'price_y', recurring: { interval: 'year' } } }] },
  ...extra,
});

describe('readStripeSubscription', () => {
  it('reads an active yearly subscription, period end from its item (new API versions)', () => {
    expect(readStripeSubscription(base({}))).toEqual({
      status: 'ACTIVE',
      interval: 'YEAR',
      currentPeriodEnd: new Date(END * 1000),
      stripePriceId: 'price_y',
    });
  });

  it('reads the period end from the subscription itself on older API versions', () => {
    const sub = base({ current_period_end: END + 10, items: { data: [{ price: { id: 'p', recurring: { interval: 'month' } } }] } });
    expect(readStripeSubscription(sub)).toMatchObject({ interval: 'MONTH', currentPeriodEnd: new Date((END + 10) * 1000) });
  });

  it('keeps Premium to period end when set to cancel, and counts a trial as active', () => {
    expect(readStripeSubscription(base({ cancel_at_period_end: true })).status).toBe('CANCELED');
    expect(readStripeSubscription(base({ status: 'trialing' })).status).toBe('ACTIVE');
  });

  it('maps failed charges to past due', () => {
    for (const status of ['past_due', 'unpaid', 'incomplete']) {
      expect(readStripeSubscription(base({ status })).status).toBe('PAST_DUE');
    }
  });

  it('closes the period when the subscription ended', () => {
    const ended = readStripeSubscription(base({ status: 'canceled', ended_at: END - 100 }));
    expect(ended).toMatchObject({ status: 'CANCELED', currentPeriodEnd: new Date((END - 100) * 1000) });
  });
});

describe('prepaid periods and grace', () => {
  const MX = 'America/Mexico_City';
  const now = new Date('2026-11-17T16:00:00Z');

  it('starts a period from now when nothing is prepaid', () => {
    expect(extendPrepaidPeriod(null, now, 1, MX).toISOString()).toBe('2026-12-18T05:59:59.000Z');
  });

  it('adds to a period still running, so paying early loses nothing', () => {
    const running = new Date('2026-12-01T05:59:59Z');
    expect(extendPrepaidPeriod(running, now, 12, MX).toISOString()).toBe('2027-12-01T05:59:59.000Z');
  });

  it('ignores a period that already ended', () => {
    expect(extendPrepaidPeriod(new Date('2026-01-01T00:00:00Z'), now, 1, MX).toISOString()).toBe(
      '2026-12-18T05:59:59.000Z'
    );
  });

  it('sets grace once and keeps it through retries', () => {
    expect(graceEnd(null, now).toISOString()).toBe('2026-11-24T16:00:00.000Z');
    const set = new Date('2026-11-20T00:00:00Z');
    expect(graceEnd(set, now)).toBe(set);
  });
});
