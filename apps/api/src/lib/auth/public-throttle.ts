import type { NextResponse } from 'next/server';
import { apiError } from '../http/api-error';
import { createFailureLimiter, type FailureLimiter } from './failure-limiter';

/**
 * Per-address limits for the public endpoints (sign-up, codes, password reset, invitations), on top
 * of the per-email limits each one has. In process memory, like the login limiter.
 */
const HOUR = 60 * 60_000;
export const publicLimits = {
  /** Sign-ups started and reset codes requested: each one sends an email. */
  emailSends: createFailureLimiter({ maxFailures: 10, windowMs: HOUR }),
  /** Wrong codes and wrong passwords. */
  wrongGuesses: createFailureLimiter({ maxFailures: 30, windowMs: 15 * 60_000 }),
};

/** A 429 response when `ip` is over `limiter`'s limit; null when it may go on. */
export function throttled(limiter: FailureLimiter, ip: string): NextResponse | null {
  const check = limiter.check(ip);
  if (check.allowed) return null;
  const response = apiError('TOO_MANY_ATTEMPTS', 'Too many attempts. Try again later.', 429);
  response.headers.set('Retry-After', String(check.retryAfterSeconds));
  return response;
}
