import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '../../../../../../lib/platform/require-admin';
import { revokeGrant } from '../../../../../../lib/platform/grants';
import { logPlatformAction } from '../../../../../../lib/platform/audit';
import { getClientIp } from '../../../../../../lib/auth/login-throttle';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

/** Ends a manual grant early. */
export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { admin } = await requirePlatformAdmin(request);
    const { id } = await params;
    const { reason } = (await request.json()) as { reason?: string };
    const grant = await revokeGrant(id, reason, admin.email);
    await logPlatformAction(
      admin.id,
      'grant.revoke',
      { type: 'PlanGrant', id },
      { clinicId: grant.clinicId, reason },
      getClientIp(request)
    );
    return NextResponse.json({ ok: true });
  }
);
