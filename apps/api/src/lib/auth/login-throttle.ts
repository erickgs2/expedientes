import type { NextRequest } from 'next/server';
import { createFailureLimiter, type LimitCheck } from './failure-limiter';

const WINDOW_MS = 15 * 60 * 1000;

// Two buckets, because each one alone has a hole:
//  - per (IP, email) stops password guessing against one account without letting a stranger lock
//    the doctor out from somewhere else — their IP differs, so their failures land elsewhere;
//  - per IP stops one source from spraying many accounts.
const perAccount = createFailureLimiter({ maxFailures: 5, windowMs: WINDOW_MS });
const perAddress = createFailureLimiter({ maxFailures: 20, windowMs: WINDOW_MS });

/**
 * The client address as the reverse proxy reports it. Caddy overwrites `X-Forwarded-For` for
 * clients it does not trust, so its first entry is the real peer, not something the client
 * chose. `unknown` still gets limited, collectively, rather than bypassing the limit.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function accountKey(ip: string, email: string): string {
  return `${ip}|${email.trim().toLowerCase()}`;
}

export function checkLoginAllowed(ip: string, email: string): LimitCheck {
  const account = perAccount.check(accountKey(ip, email));
  if (!account.allowed) return account;
  return perAddress.check(ip);
}

export function recordLoginFailure(ip: string, email: string): void {
  perAccount.recordFailure(accountKey(ip, email));
  perAddress.recordFailure(ip);
}

export function recordLoginSuccess(ip: string, email: string): void {
  // Only the account bucket: a successful login says nothing about the rest of the address's
  // traffic, so it must not wipe the per-address count.
  perAccount.reset(accountKey(ip, email));
}
