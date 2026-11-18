import { Prisma } from '@prisma/client';
import { prismaUnscoped } from '../prisma/client';
import { sendEmail } from '../email/send-email';
import { paymentFailedEmail, paymentReceivedEmail } from '../email/templates';
import { stripeRequest } from './stripe-client';
import {
  extendPrepaidPeriod,
  graceEnd,
  readStripeSubscription,
  type StripeSubscription,
} from './subscription-state';

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

interface CheckoutSessionObject {
  id: string;
  mode: 'subscription' | 'payment' | 'setup';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  subscription?: string | null;
  client_reference_id?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string>;
}

interface InvoiceObject {
  id: string;
  billing_reason?: string;
  amount_paid?: number;
  subscription?: string | null;
  parent?: { subscription_details?: { subscription?: string } } | null;
}

async function clinicContact(clinicId: string) {
  return prismaUnscoped.clinic.findUnique({
    where: { id: clinicId },
    select: {
      name: true,
      timeZone: true,
      memberships: { where: { isOwner: true }, select: { user: { select: { email: true } } } },
    },
  });
}

async function emailOwner(clinicId: string, build: (to: string, clinic: { name: string; timeZone: string }) => Parameters<typeof sendEmail>[0]) {
  try {
    const clinic = await clinicContact(clinicId);
    const owner = clinic?.memberships[0]?.user.email;
    if (clinic && owner) await sendEmail(build(owner, clinic));
  } catch (error) {
    console.error(`Could not email the owner of clinic ${clinicId}`, error);
  }
}

async function planPriceIdFor(stripePriceId: string | null): Promise<string | null> {
  if (!stripePriceId) return null;
  const price = await prismaUnscoped.planPrice.findFirst({
    where: { OR: [{ stripeMonthlyPriceId: stripePriceId }, { stripeAnnualPriceId: stripePriceId }] },
    select: { id: true },
  });
  return price?.id ?? null;
}

/** Which clinic a Stripe subscription belongs to: its metadata, or the row that already points to it. */
async function clinicForSubscription(sub: StripeSubscription): Promise<string | null> {
  if (sub.metadata?.['clinicId']) return sub.metadata['clinicId'];
  const row = await prismaUnscoped.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { clinicId: true },
  });
  return row?.clinicId ?? null;
}

/**
 * Brings MedCloud's Subscription in line with Stripe's. Always from the subscription object as
 * Stripe has it now, so events arriving late or out of order cannot leave an older state behind.
 */
export async function applyStripeSubscription(sub: StripeSubscription, now = new Date()) {
  const clinicId = await clinicForSubscription(sub);
  if (!clinicId) {
    console.warn(`Stripe subscription ${sub.id} has no clinic`);
    return null;
  }
  const state = readStripeSubscription(sub);
  const existing = await prismaUnscoped.subscription.findUnique({ where: { clinicId } });
  const data = {
    plan: 'PREMIUM' as const,
    status: state.status,
    interval: state.interval,
    method: 'CARD' as const,
    currentPeriodEnd: state.currentPeriodEnd,
    graceEndsAt: state.status === 'PAST_DUE' ? graceEnd(existing?.graceEndsAt ?? null, now) : null,
    priceId: await planPriceIdFor(state.stripePriceId),
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
  };
  const saved = await prismaUnscoped.subscription.upsert({
    where: { clinicId },
    update: data,
    create: { clinicId, ...data },
  });
  return { clinicId, subscription: saved };
}

function fetchSubscription(id: string) {
  return stripeRequest<StripeSubscription>('GET', `/subscriptions/${id}`);
}

/**
 * A paid OXXO voucher: adds its period to whatever is already prepaid. The event is recorded in the
 * same transaction as the extension, so a redelivered event cannot add the period twice.
 */
async function applyOxxoPayment(eventId: string, eventType: string, session: CheckoutSessionObject, now: Date) {
  const clinicId = session.metadata?.['clinicId'] ?? session.client_reference_id ?? null;
  if (!clinicId) return;
  const interval = session.metadata?.['interval'] === 'YEAR' ? 'YEAR' : 'MONTH';
  const clinic = await prismaUnscoped.clinic.findUnique({ where: { id: clinicId }, select: { timeZone: true } });
  if (!clinic) return;
  const paidUntil = await prismaUnscoped.$transaction(async (tx) => {
    await tx.paymentEvent.create({
      data: {
        id: eventId,
        type: eventType,
        clinicId,
        amountCents: session.amount_total ?? null,
        summary: `OXXO ${interval === 'YEAR' ? 'anual' : 'mensual'}`,
      },
    });
    const existing = await tx.subscription.findUnique({ where: { clinicId } });
    const currentEnd = existing?.method === 'OXXO' ? existing.currentPeriodEnd : null;
    const end = extendPrepaidPeriod(currentEnd, now, interval === 'YEAR' ? 12 : 1, clinic.timeZone);
    const data = {
      plan: 'PREMIUM' as const,
      status: 'ACTIVE' as const,
      interval: interval as 'MONTH' | 'YEAR',
      method: 'OXXO' as const,
      currentPeriodEnd: end,
      graceEndsAt: null,
      priceId: session.metadata?.['planPriceId'] ?? null,
      stripeSubscriptionId: null,
      renewalNotice7SentAt: null,
      renewalNotice1SentAt: null,
    };
    await tx.subscription.upsert({ where: { clinicId }, update: data, create: { clinicId, ...data } });
    return end;
  });
  await emailOwner(clinicId, (to, c) =>
    paymentReceivedEmail(to, {
      clinicName: c.name,
      amountCents: session.amount_total ?? null,
      paidUntil,
      timeZone: c.timeZone,
      method: 'OXXO',
    })
  );
}

async function record(event: StripeEvent, clinicId: string | null, amountCents: number | null, summary: string) {
  try {
    await prismaUnscoped.paymentEvent.create({
      data: { id: event.id, type: event.type, clinicId, amountCents, summary },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }
}

/** Applies one verified Stripe event. Returns false when it had already been applied. */
export async function handleStripeEvent(event: StripeEvent, now = new Date()): Promise<boolean> {
  const seen = await prismaUnscoped.paymentEvent.findUnique({ where: { id: event.id }, select: { id: true } });
  if (seen) return false;
  const object = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = object as unknown as CheckoutSessionObject;
      if (session.mode === 'subscription' && session.subscription) {
        const applied = await applyStripeSubscription(await fetchSubscription(session.subscription), now);
        await record(event, applied?.clinicId ?? null, session.amount_total ?? null, 'Suscripción con tarjeta');
        if (applied) {
          await emailOwner(applied.clinicId, (to, c) =>
            paymentReceivedEmail(to, {
              clinicName: c.name,
              amountCents: session.amount_total ?? null,
              paidUntil: applied.subscription.currentPeriodEnd,
              timeZone: c.timeZone,
              method: 'CARD',
            })
          );
        }
      } else if (session.mode === 'payment' && session.payment_status === 'paid') {
        await applyOxxoPayment(event.id, event.type, session, now);
      } else {
        // An OXXO voucher was issued; the money arrives later (async_payment_succeeded).
        await record(event, session.metadata?.['clinicId'] ?? null, session.amount_total ?? null, 'Ficha OXXO generada');
      }
      return true;
    }
    case 'checkout.session.async_payment_failed': {
      const session = object as unknown as CheckoutSessionObject;
      await record(event, session.metadata?.['clinicId'] ?? null, null, 'Ficha OXXO vencida sin pago');
      return true;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = object as unknown as InvoiceObject;
      const subscriptionId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
      if (!subscriptionId) {
        await record(event, null, invoice.amount_paid ?? null, 'Factura sin suscripción');
        return true;
      }
      const applied = await applyStripeSubscription(await fetchSubscription(subscriptionId), now);
      const failed = event.type === 'invoice.payment_failed';
      await record(event, applied?.clinicId ?? null, failed ? null : invoice.amount_paid ?? null, failed ? 'Cobro con tarjeta fallido' : 'Cobro con tarjeta');
      if (applied && failed && applied.subscription.graceEndsAt) {
        const graceEndsAt = applied.subscription.graceEndsAt;
        await emailOwner(applied.clinicId, (to, c) => paymentFailedEmail(to, { clinicName: c.name, graceEndsAt, timeZone: c.timeZone }));
      }
      // Renewals only: the first invoice is covered by the checkout email.
      if (applied && !failed && invoice.billing_reason === 'subscription_cycle') {
        await emailOwner(applied.clinicId, (to, c) =>
          paymentReceivedEmail(to, {
            clinicName: c.name,
            amountCents: invoice.amount_paid ?? null,
            paidUntil: applied.subscription.currentPeriodEnd,
            timeZone: c.timeZone,
            method: 'CARD',
          })
        );
      }
      return true;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const applied = await applyStripeSubscription(object as unknown as StripeSubscription, now);
      await record(event, applied?.clinicId ?? null, null, event.type === 'customer.subscription.deleted' ? 'Suscripción terminada' : 'Suscripción actualizada');
      return true;
    }
    default:
      await record(event, null, null, 'Ignorado');
      return true;
  }
}
