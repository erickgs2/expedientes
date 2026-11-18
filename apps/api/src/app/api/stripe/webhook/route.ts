import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '../../../../lib/billing/webhook-signature';
import { handleStripeEvent, type StripeEvent } from '../../../../lib/billing/webhook';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/**
 * Stripe's webhook. Public, but nothing is applied without a valid signature from the endpoint's
 * signing secret (STRIPE_WEBHOOK_SECRET). A 5xx makes Stripe retry; applying an event twice is safe.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return apiError('PAYMENTS_UNAVAILABLE', 'Webhook not configured', 503);
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) {
    return apiError('INVALID_SIGNATURE', 'Invalid signature', 400);
  }
  const event = JSON.parse(raw) as StripeEvent;
  const applied = await handleStripeEvent(event);
  return NextResponse.json({ received: true, applied });
});
