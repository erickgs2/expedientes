/**
 * A small client for Stripe's REST API (form-encoded requests, JSON responses), so the API needs no
 * SDK dependency. Only the calls MedCloud makes are wrapped elsewhere in lib/billing.
 *
 * Keys come from the environment and never from the database or the repository:
 * STRIPE_SECRET_KEY (sk_live_… or sk_test_…) and STRIPE_WEBHOOK_SECRET (whsec_…).
 */

const API = 'https://api.stripe.com/v1';

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export class StripeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

type Param = string | number | boolean | null | undefined | Param[] | { [key: string]: Param };

/**
 * Stripe's form encoding of nested parameters: `line_items[0][price]=…`, `metadata[clinicId]=…`.
 * Null and undefined are left out.
 */
export function encodeStripeParams(params: Record<string, Param>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          parts.push(...encodeStripeParams(item as Record<string, Param>, `${name}[${i}]`));
        } else if (item !== undefined && item !== null) {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === 'object') {
      parts.push(...encodeStripeParams(value as Record<string, Param>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

export async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, Param> = {},
  options: { idempotencyKey?: string } = {}
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeError(0, 'not_configured', 'Stripe is not configured');
  const body = encodeStripeParams(params).join('&');
  const url = method === 'GET' && body ? `${API}${path}?${body}` : `${API}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: method === 'POST' ? body : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new StripeError(response.status, json.error?.code, json.error?.message ?? `Stripe answered ${response.status}`);
  }
  return json as T;
}
