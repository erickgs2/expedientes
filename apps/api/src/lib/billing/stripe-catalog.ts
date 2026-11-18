import type { PlanPrice } from '@prisma/client';
import { prismaUnscoped } from '../prisma/client';
import { StripeError, stripeConfigured, stripeRequest } from './stripe-client';

/** The one product everything is sold under, with a fixed id so creating it twice is harmless. */
export const STRIPE_PRODUCT_ID = 'medcloud_premium';

interface StripePrice {
  id: string;
}

let productReady = false;

export async function ensureStripeProduct(): Promise<void> {
  if (productReady) return;
  try {
    await stripeRequest('POST', '/products', {
      id: STRIPE_PRODUCT_ID,
      name: 'MedCloud Premium',
      description: 'Usuarios y tipos de tratamiento ilimitados, WhatsApp, roles y 20 GB para fotos.',
    });
  } catch (error) {
    if (!(error instanceof StripeError && error.code === 'resource_already_exists')) throw error;
  }
  productReady = true;
}

/**
 * Makes sure a price version has its two Stripe prices (monthly and yearly, recurring, MXN, IVA
 * included in the amount) and returns the version with their ids. Stripe prices cannot be edited,
 * so each version gets its own pair.
 */
export async function ensureStripePrices(price: PlanPrice): Promise<PlanPrice> {
  if (price.stripeMonthlyPriceId && price.stripeAnnualPriceId) return price;
  await ensureStripeProduct();
  const create = (interval: 'month' | 'year', amount: number) =>
    stripeRequest<StripePrice>(
      'POST',
      '/prices',
      {
        product: STRIPE_PRODUCT_ID,
        currency: 'mxn',
        unit_amount: amount,
        tax_behavior: 'inclusive',
        recurring: { interval },
        nickname: `Premium ${interval === 'month' ? 'mensual' : 'anual'} ${amount / 100} MXN`,
        metadata: { planPriceId: price.id },
      },
      { idempotencyKey: `medcloud-price-${price.id}-${interval}` }
    );
  const [monthly, annual] = await Promise.all([
    price.stripeMonthlyPriceId ? Promise.resolve({ id: price.stripeMonthlyPriceId }) : create('month', price.monthlyCents),
    price.stripeAnnualPriceId ? Promise.resolve({ id: price.stripeAnnualPriceId }) : create('year', price.annualCents),
  ]);
  return prismaUnscoped.planPrice.update({
    where: { id: price.id },
    data: { stripeMonthlyPriceId: monthly.id, stripeAnnualPriceId: annual.id },
  });
}

/**
 * After a price change: creates the new version's Stripe prices and archives the older ones, so new
 * checkouts use the new price while existing subscriptions keep theirs (Stripe never moves them).
 * Does nothing until Stripe is configured; checkout creates missing prices on demand anyway.
 */
export async function syncStripePricesAfterChange(newPrice: PlanPrice): Promise<void> {
  if (!stripeConfigured()) return;
  await ensureStripePrices(newPrice);
  const older = await prismaUnscoped.planPrice.findMany({
    where: { id: { not: newPrice.id }, OR: [{ stripeMonthlyPriceId: { not: null } }, { stripeAnnualPriceId: { not: null } }] },
  });
  for (const price of older) {
    for (const id of [price.stripeMonthlyPriceId, price.stripeAnnualPriceId]) {
      if (!id) continue;
      await stripeRequest('POST', `/prices/${id}`, { active: false }).catch((error) =>
        console.error(`Could not archive Stripe price ${id}`, error)
      );
    }
  }
}

/** The price version in force, as a full row. */
export async function currentPlanPriceRow(now = new Date()): Promise<PlanPrice | null> {
  return prismaUnscoped.planPrice.findFirst({
    where: { effectiveFrom: { lte: now } },
    orderBy: { effectiveFrom: 'desc' },
  });
}
