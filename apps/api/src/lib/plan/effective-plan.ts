import { PLAN_LIMITS, type ClinicPlanSummary, type PlanTier } from '@expedientes/shared-types';

export interface SubscriptionLike {
  plan: PlanTier;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  currentPeriodEnd: Date;
  graceEndsAt: Date | null;
}

export interface GrantLike {
  plan: PlanTier;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
}

/**
 * Until when a subscription keeps the clinic on its plan, or null when it no longer does. A paid or
 * cancelled subscription lasts to the end of the period already paid; one whose card charge failed
 * lasts to the end of its grace period while Stripe retries.
 */
export function subscriptionPaidUntil(subscription: SubscriptionLike, now: Date): Date | null {
  if (subscription.plan !== 'PREMIUM') return null;
  let until = subscription.currentPeriodEnd;
  if (subscription.status === 'PAST_DUE' && subscription.graceEndsAt && subscription.graceEndsAt > until) {
    until = subscription.graceEndsAt;
  }
  return until > now ? until : null;
}

/**
 * Until when manual grants keep the clinic on Premium without a break, or null when no grant covers
 * `now`. Grants queued back to back ("start when the current one ends") count as one stretch.
 */
export function grantedUntil(grants: GrantLike[], now: Date): Date | null {
  const live = grants
    .filter((grant) => grant.plan === 'PREMIUM' && !grant.revokedAt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  let until: Date | null = null;
  for (const grant of live) {
    const covers = until ? grant.startsAt <= until : grant.startsAt <= now;
    if (covers && grant.endsAt > now && (!until || grant.endsAt > until)) until = grant.endsAt;
  }
  return until;
}

/**
 * The plan a clinic is on right now. Computed from dates when it is read, so nothing has to run when
 * a period or a grant ends: the next request simply sees Free.
 */
export function resolveEffectivePlan(
  subscription: SubscriptionLike | null,
  grants: GrantLike[],
  now: Date
): ClinicPlanSummary {
  const paidUntil = subscription ? subscriptionPaidUntil(subscription, now) : null;
  const grantEnd = grantedUntil(grants, now);
  const tier: PlanTier = paidUntil || grantEnd ? 'PREMIUM' : 'FREE';
  const premiumUntil =
    paidUntil && grantEnd ? (paidUntil > grantEnd ? paidUntil : grantEnd) : paidUntil ?? grantEnd;
  return {
    tier,
    source: paidUntil ? 'SUBSCRIPTION' : grantEnd ? 'GRANT' : 'FREE',
    premiumUntil: premiumUntil?.toISOString() ?? null,
    grantEndsAt: grantEnd?.toISOString() ?? null,
    features: { ...PLAN_LIMITS[tier].features },
  };
}
