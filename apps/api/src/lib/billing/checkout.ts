import { prismaUnscoped } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';
import { appBaseUrl } from '../email/templates';
import { stripeConfigured, stripeRequest } from './stripe-client';
import { STRIPE_PRODUCT_ID, currentPlanPriceRow, ensureStripePrices } from './stripe-catalog';

export type CheckoutInterval = 'MONTH' | 'YEAR';
export type CheckoutMethod = 'CARD' | 'OXXO';

/** Days an OXXO voucher can be paid in (Stripe allows 1–7). */
export function oxxoVoucherDays(): number {
  const days = Number(process.env.OXXO_VOUCHER_DAYS ?? 3);
  return Number.isInteger(days) && days >= 1 && days <= 7 ? days : 3;
}

interface CheckoutSession {
  id: string;
  url: string;
}

async function ensureCustomer(clinicId: string, email: string): Promise<string> {
  const clinic = await prismaUnscoped.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true, stripeCustomerId: true },
  });
  if (clinic.stripeCustomerId) return clinic.stripeCustomerId;
  const customer = await stripeRequest<{ id: string }>(
    'POST',
    '/customers',
    { email, name: clinic.name, metadata: { clinicId } },
    { idempotencyKey: `medcloud-customer-${clinicId}` }
  );
  await prismaUnscoped.clinic.update({ where: { id: clinicId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * A Stripe Checkout page for buying Premium. Card: a subscription that renews on its own. OXXO: a
 * one-off payment for one period (1 or 12 months), paid at the store with a voucher, since OXXO does
 * not support recurring charges. Card details never touch MedCloud's servers.
 */
export async function createCheckout(params: {
  clinicId: string;
  ownerEmail: string;
  interval: CheckoutInterval;
  method: CheckoutMethod;
  now?: Date;
}): Promise<string> {
  if (!stripeConfigured()) {
    throw new ApiProblem('PAYMENTS_UNAVAILABLE', 'Online payments are not available yet', 503);
  }
  const now = params.now ?? new Date();
  const existing = await prismaUnscoped.subscription.findUnique({ where: { clinicId: params.clinicId } });
  const cardRunning =
    existing?.method === 'CARD' && existing.status !== 'CANCELED' && existing.currentPeriodEnd > now;
  if (cardRunning) {
    throw new ApiProblem('ALREADY_SUBSCRIBED', 'This clinic already pays by card; manage it from the billing portal', 409);
  }

  const priceRow = await currentPlanPriceRow(now);
  if (!priceRow) throw new ApiProblem('PAYMENTS_UNAVAILABLE', 'No price is configured', 503);
  const price = await ensureStripePrices(priceRow);
  const customer = await ensureCustomer(params.clinicId, params.ownerEmail);
  const base = appBaseUrl();
  const metadata = {
    clinicId: params.clinicId,
    interval: params.interval,
    planPriceId: price.id,
    method: params.method,
  };
  const common = {
    customer,
    client_reference_id: params.clinicId,
    locale: 'es-419',
    metadata,
    success_url: `${base}/admin/plan?pago=listo&metodo=${params.method.toLowerCase()}`,
    cancel_url: `${base}/admin/plan?pago=cancelado`,
  };

  if (params.method === 'CARD') {
    // Moving from a prepaid OXXO period to a card: the first charge waits until that period ends.
    const oxxoEnd =
      existing?.method === 'OXXO' && existing.currentPeriodEnd.getTime() > now.getTime() + 48 * 3_600_000
        ? Math.floor(existing.currentPeriodEnd.getTime() / 1000)
        : undefined;
    const session = await stripeRequest<CheckoutSession>('POST', '/checkout/sessions', {
      ...common,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: params.interval === 'YEAR' ? price.stripeAnnualPriceId : price.stripeMonthlyPriceId,
          quantity: 1,
        },
      ],
      subscription_data: { metadata, trial_end: oxxoEnd },
    });
    return session.url;
  }

  const session = await stripeRequest<CheckoutSession>('POST', '/checkout/sessions', {
    ...common,
    mode: 'payment',
    payment_method_types: ['oxxo'],
    line_items: [
      {
        price_data: {
          currency: 'mxn',
          product: STRIPE_PRODUCT_ID,
          unit_amount: params.interval === 'YEAR' ? price.annualCents : price.monthlyCents,
          tax_behavior: 'inclusive',
        },
        quantity: 1,
      },
    ],
    payment_method_options: { oxxo: { expires_after_days: oxxoVoucherDays() } },
    payment_intent_data: { metadata },
  });
  return session.url;
}

/** Stripe's customer portal: change the card, see receipts, cancel. */
export async function createBillingPortal(clinicId: string): Promise<string> {
  if (!stripeConfigured()) throw new ApiProblem('PAYMENTS_UNAVAILABLE', 'Online payments are not available yet', 503);
  const clinic = await prismaUnscoped.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { stripeCustomerId: true },
  });
  if (!clinic.stripeCustomerId) throw new ApiProblem('NO_BILLING', 'This clinic has not paid online yet', 404);
  const session = await stripeRequest<{ url: string }>('POST', '/billing_portal/sessions', {
    customer: clinic.stripeCustomerId,
    return_url: `${appBaseUrl()}/admin/plan`,
    locale: 'es-419',
  });
  return session.url;
}
