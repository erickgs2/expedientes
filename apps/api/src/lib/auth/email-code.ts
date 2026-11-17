import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/**
 * Six-digit codes sent by email, for confirming a sign-up and resetting a password.
 *
 * Only an HMAC of the code is stored, keyed by the server secret and bound to who it was sent to,
 * so a database copy reveals no code and a code for one address is useless for another.
 */

export const CODE_TTL_MINUTES = 10;
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60_000;
/** Wrong guesses before the code stops working and a new one must be requested. */
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not configured');
  return value;
}

/** `scope` names what the code is for and for whom, e.g. `signup:ana@clinica.mx`. */
export function hashCode(code: string, scope: string): string {
  return createHmac('sha256', secret()).update(`${scope}:${code}`).digest('hex');
}

export function codeMatches(code: string, scope: string, storedHash: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(hashCode(code, scope), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SendHistory {
  lastSentAt: Date;
  sendCount: number;
  sendWindowStart: Date;
}

export type SendDecision =
  | { allowed: true; sendCount: number; sendWindowStart: Date }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Whether another code may be sent now: at least a minute after the last one, and at most five in
 * an hour. Returns the counters to store when it may.
 */
export function decideResend(history: SendHistory | null, now: Date): SendDecision {
  if (!history) return { allowed: true, sendCount: 1, sendWindowStart: now };
  const sinceLast = now.getTime() - history.lastSentAt.getTime();
  if (sinceLast < RESEND_COOLDOWN_MS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000) };
  }
  const windowAge = now.getTime() - history.sendWindowStart.getTime();
  if (windowAge >= HOUR_MS) return { allowed: true, sendCount: 1, sendWindowStart: now };
  if (history.sendCount >= MAX_SENDS_PER_HOUR) {
    return { allowed: false, retryAfterSeconds: Math.ceil((HOUR_MS - windowAge) / 1000) };
  }
  return { allowed: true, sendCount: history.sendCount + 1, sendWindowStart: history.sendWindowStart };
}

/** Lower-cased and trimmed; the one form an email is stored and looked up in. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately loose: the code sent to it is the real check. */
export function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const MIN_PASSWORD_LENGTH = 10;

export function isAcceptablePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH && password.length <= 200;
}
