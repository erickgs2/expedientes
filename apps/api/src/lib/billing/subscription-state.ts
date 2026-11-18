import { grantEndDate } from '../plan/grant-dates';

/** The parts of a Stripe Subscription object MedCloud reads. Covers API versions before and after
 * current_period_end moved from the subscription to its items (2025-03-31). */
export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  ended_at?: number | null;
  trial_end?: number | null;
  metadata?: Record<string, string>;
  items?: {
    data: Array<{ current_period_end?: number; price?: { id: string; recurring?: { interval?: string } } }>;
  };
}

export interface SubscriptionState {
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  interval: 'MONTH' | 'YEAR';
  currentPeriodEnd: Date;
  stripePriceId: string | null;
}

/**
 * How a Stripe subscription maps onto MedCloud's: paid (or trialing until a prepaid OXXO period
 * ends) is ACTIVE; set to cancel at period end is CANCELED but keeps Premium until then; a failed
 * charge is PAST_DUE (grace); ended is CANCELED with the period closed at the moment it ended.
 */
export function readStripeSubscription(sub: StripeSubscription): SubscriptionState {
  const item = sub.items?.data?.[0];
  const periodEndSeconds = sub.current_period_end ?? item?.current_period_end ?? sub.trial_end ?? 0;
  let status: SubscriptionState['status'];
  let end = new Date(periodEndSeconds * 1000);
  switch (sub.status) {
    case 'active':
    case 'trialing':
      status = sub.cancel_at_period_end ? 'CANCELED' : 'ACTIVE';
      break;
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      status = 'PAST_DUE';
      break;
    default:
      status = 'CANCELED';
      if (sub.ended_at) end = new Date(sub.ended_at * 1000);
  }
  return {
    status,
    interval: item?.price?.recurring?.interval === 'year' ? 'YEAR' : 'MONTH',
    currentPeriodEnd: end,
    stripePriceId: item?.price?.id ?? null,
  };
}

export const GRACE_DAYS = 7;

/** Grace after a failed card charge: kept once set, so retries do not keep extending it. */
export function graceEnd(existing: Date | null, now: Date): Date {
  return existing ?? new Date(now.getTime() + GRACE_DAYS * 86_400_000);
}

/**
 * The end of a prepaid OXXO period: 1 or 12 months added to whatever is still paid (so paying early
 * loses nothing), or from now when nothing is; the same day at 23:59:59 in the clinic's time zone.
 */
export function extendPrepaidPeriod(
  currentEnd: Date | null,
  now: Date,
  months: number,
  timeZone: string
): Date {
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  return grantEndDate(base, months, timeZone);
}
