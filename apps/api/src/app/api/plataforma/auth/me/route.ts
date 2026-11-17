import { NextRequest, NextResponse } from 'next/server';
import type { PlatformAdminView } from '@expedientes/shared-types';
import { requirePlatformAdmin } from '../../../../../lib/platform/require-admin';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  const { admin } = await requirePlatformAdmin(request);
  return NextResponse.json({ admin: { email: admin.email, fullName: admin.fullName } satisfies PlatformAdminView });
});
