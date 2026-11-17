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
 * The client address, from the one header this deployment trusts to carry it.
 *
 * `TRUSTED_CLIENT_IP_HEADER` names a header that the edge in front of the app always overwrites, so
 * a client cannot choose its value: `cf-connecting-ip` behind Cloudflare (the Mac server). It must
 * stay unset anywhere a client can reach the app without passing that edge, or the client could
 * send the header itself and pick any address.
 *
 * Without it, the first `X-Forwarded-For` entry is used: Caddy overwrites that header for clients it
 * does not trust, so behind Caddy (QA) its first entry is the real peer. `unknown` still gets
 * limited, collectively, rather than bypassing the limit.
 */
export function getClientIp(request: NextRequest): string {
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trustedHeader) {
    const value = request.headers.get(trustedHeader)?.trim();
    if (value) return value;
  }
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
