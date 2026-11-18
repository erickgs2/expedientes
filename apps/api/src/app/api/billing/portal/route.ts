import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/http/require-auth';
import { prisma } from '../../../../lib/prisma/client';
import { createBillingPortal } from '../../../../lib/billing/checkout';
import { currentClinicId } from '../../../../lib/tenancy/context';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Stripe's customer portal for the clinic: card, receipts, cancellation. Owner only. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'clinic-settings', 'view');
  const owner = await prisma.membership.findFirst({ where: { userId, isOwner: true } });
  if (!owner) return apiError('FORBIDDEN', "Only the clinic's owner can manage payments", 403);
  return NextResponse.json({ url: await createBillingPortal(currentClinicId()) });
});
