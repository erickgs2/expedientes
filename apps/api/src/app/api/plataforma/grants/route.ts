import { NextRequest, NextResponse } from 'next/server';
import type { GrantPremiumRequest } from '@expedientes/shared-types';
import { requirePlatformAdmin } from '../../../../lib/platform/require-admin';
import { grantPremium } from '../../../../lib/platform/grants';
import { logPlatformAction } from '../../../../lib/platform/audit';
import { getClientIp } from '../../../../lib/auth/login-throttle';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Gives Premium by hand to one or several clinics for a number of months. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const { admin } = await requirePlatformAdmin(request);
  const body = (await request.json()) as Partial<GrantPremiumRequest>;
  const result = await grantPremium(body, admin.email);
  await logPlatformAction(
    admin.id,
    'grant.create',
    { type: 'Clinic' },
    { months: body.months, start: body.start, reason: body.reason, granted: result.granted },
    getClientIp(request)
  );
  return NextResponse.json(result, { status: 201 });
});
