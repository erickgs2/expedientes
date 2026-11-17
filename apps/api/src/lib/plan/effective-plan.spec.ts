import { grantedUntil, resolveEffectivePlan, type GrantLike, type SubscriptionLike } from './effective-plan';

const now = new Date('2026-11-17T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

function grant(start: number, end: number, extra: Partial<GrantLike> = {}): GrantLike {
  return { plan: 'PREMIUM', startsAt: days(start), endsAt: days(end), revokedAt: null, ...extra };
}

function subscription(extra: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return { plan: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: days(10), graceEndsAt: null, ...extra };
}

describe('resolveEffectivePlan', () => {
  it('is Free with nothing', () => {
    const plan = resolveEffectivePlan(null, [], now);
    expect(plan).toMatchObject({ tier: 'FREE', source: 'FREE', premiumUntil: null, grantEndsAt: null });
    expect(plan.features.whatsappReminders).toBe(false);
  });

  it('is Premium while a grant covers now', () => {
    const plan = resolveEffectivePlan(null, [grant(-30, 335)], now);
    expect(plan).toMatchObject({ tier: 'PREMIUM', source: 'GRANT', premiumUntil: days(335).toISOString() });
    expect(plan.features).toEqual({ whatsappReminders: true, customRoles: true, unbrandedPdf: true });
  });

  it('ignores expired, future and revoked grants', () => {
    expect(resolveEffectivePlan(null, [grant(-60, -1)], now).tier).toBe('FREE');
    expect(resolveEffectivePlan(null, [grant(5, 40)], now).tier).toBe('FREE');
    expect(resolveEffectivePlan(null, [grant(-1, 40, { revokedAt: days(-1) })], now).tier).toBe('FREE');
  });

  it('is Premium while a paid subscription is in its period, even if cancelled', () => {
    expect(resolveEffectivePlan(subscription(), [], now)).toMatchObject({ tier: 'PREMIUM', source: 'SUBSCRIPTION' });
    expect(resolveEffectivePlan(subscription({ status: 'CANCELED' }), [], now).tier).toBe('PREMIUM');
    expect(resolveEffectivePlan(subscription({ currentPeriodEnd: days(-1) }), [], now).tier).toBe('FREE');
  });

  it('keeps a failed card on Premium until its grace period ends', () => {
    const lapsed = { status: 'PAST_DUE' as const, currentPeriodEnd: days(-2) };
    expect(resolveEffectivePlan(subscription({ ...lapsed, graceEndsAt: days(5) }), [], now)).toMatchObject({
      tier: 'PREMIUM',
      premiumUntil: days(5).toISOString(),
    });
    expect(resolveEffectivePlan(subscription({ ...lapsed, graceEndsAt: days(-1) }), [], now).tier).toBe('FREE');
  });

  it('reports a paying clinic with a courtesy grant as subscription, ending at the later date', () => {
    const plan = resolveEffectivePlan(subscription({ currentPeriodEnd: days(10) }), [grant(-1, 90)], now);
    expect(plan).toMatchObject({
      source: 'SUBSCRIPTION',
      premiumUntil: days(90).toISOString(),
      grantEndsAt: days(90).toISOString(),
    });
  });
});

describe('grantedUntil', () => {
  it('joins grants queued back to back', () => {
    expect(grantedUntil([grant(-10, 20), grant(20, 50), grant(50, 80)], now)).toEqual(days(80));
  });

  it('stops at a gap', () => {
    expect(grantedUntil([grant(-10, 20), grant(25, 50)], now)).toEqual(days(20));
  });

  it('skips a revoked grant in the chain', () => {
    expect(grantedUntil([grant(-10, 20), grant(20, 50, { revokedAt: days(-1) })], now)).toEqual(days(20));
  });
});
