import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Which clinic the current request (or background job) acts for.
 *
 * Every API request runs inside its own store (withApiErrors opens it), and authentication sets the
 * clinic on it once it has verified the user's membership. The scoped Prisma client reads it on
 * every query, so code below the route handler never passes a clinic id around and cannot forget to
 * filter by one.
 */
interface TenancyStore {
  clinicId?: string;
  /** Values computed once per request (see requestMemo). */
  memo?: Map<string, Promise<unknown>>;
}

const storage = new AsyncLocalStorage<TenancyStore>();

/** A tenant query ran with no clinic set: a programming error, never a client error. */
export class NoClinicContextError extends Error {
  constructor(message = 'No clinic is set for this request') {
    super(message);
    this.name = 'NoClinicContextError';
  }
}

/** Opens an empty store for one request; authentication fills in the clinic. */
export function runWithRequestContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

/** Runs `fn` acting for `clinicId`: background jobs (the reminder sweep), scripts and tests. */
export function runAsClinic<T>(clinicId: string, fn: () => T): T {
  return storage.run({ clinicId }, fn);
}

/**
 * Sets the clinic for the rest of the current request. A request acts for exactly one clinic: being
 * asked to switch to a different one mid-request means something is wrong, so it throws.
 */
export function setCurrentClinic(clinicId: string): void {
  const store = storage.getStore();
  if (!store) throw new NoClinicContextError('setCurrentClinic called outside a request context');
  if (store.clinicId && store.clinicId !== clinicId) {
    throw new NoClinicContextError('A request cannot switch to a different clinic');
  }
  store.clinicId = clinicId;
}

export function currentClinicIdOrNull(): string | null {
  return storage.getStore()?.clinicId ?? null;
}

export function currentClinicId(): string {
  const clinicId = currentClinicIdOrNull();
  if (!clinicId) throw new NoClinicContextError();
  return clinicId;
}

/**
 * Computes `compute()` once per request (or background run) and returns the same promise to every
 * later caller with the same key: the clinic's plan, for instance, is needed by authentication and
 * again by each limit check. Outside any context it just computes.
 */
export function requestMemo<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return compute();
  store.memo ??= new Map();
  let value = store.memo.get(key) as Promise<T> | undefined;
  if (!value) {
    value = compute();
    store.memo.set(key, value);
  }
  return value;
}
