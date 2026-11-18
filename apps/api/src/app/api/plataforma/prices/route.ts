import { NextRequest, NextResponse } from 'next/server';
import type { NewPriceRequest } from '@expedientes/shared-types';
import { requirePlatformAdmin } from '../../../../lib/platform/require-admin';
import { createPriceVersion, listPriceVersions } from '../../../../lib/platform/prices';
import { syncStripePricesAfterChange } from '../../../../lib/billing/stripe-catalog';
import { logPlatformAction } from '../../../../lib/platform/audit';
import { getClientIp } from '../../../../lib/auth/login-throttle';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Every Premium price version, the one in force marked. */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requirePlatformAdmin(request);
  return NextResponse.json({ versions: await listPriceVersions() });
});

/** A new price for new purchases, in force from now. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const { admin } = await requirePlatformAdmin(request);
  const body = (await request.json()) as Partial<NewPriceRequest>;
  const price = await createPriceVersion(body, admin.email);
  // New checkouts use the new Stripe prices; a failure here is repaired at the next checkout, which
  // creates any missing price, so it never undoes the saved version.
  await syncStripePricesAfterChange(price).catch((error) => console.error('Could not sync Stripe prices', error));
  await logPlatformAction(
    admin.id,
    'price.create',
    { type: 'PlanPrice', id: price.id },
    { monthlyCents: price.monthlyCents, annualDiscountPercent: price.annualDiscountPercent, annualCents: price.annualCents },
    getClientIp(request)
  );
  return NextResponse.json({ versions: await listPriceVersions() }, { status: 201 });
});
