import { NextRequest, NextResponse } from 'next/server';
import { prismaUnscoped } from '../../../../../../lib/prisma/client';
import { requirePlatformAdmin } from '../../../../../../lib/platform/require-admin';
import { logPlatformAction } from '../../../../../../lib/platform/audit';
import { getClientIp } from '../../../../../../lib/auth/login-throttle';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

/**
 * Suspends or reactivates a clinic. Suspended, nobody in it can sign in and its WhatsApp messages
 * stop; nothing is deleted.
 */
export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { admin } = await requirePlatformAdmin(request);
    const { id } = await params;
    const { status, reason } = (await request.json()) as { status?: string; reason?: string };
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      return apiError('INVALID_INPUT', 'status must be ACTIVE or SUSPENDED', 400);
    }
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (status === 'SUSPENDED' && why.length < 3) return apiError('INVALID_INPUT', 'A reason is required', 400);
    const result = await prismaUnscoped.clinic.updateMany({ where: { id }, data: { status } });
    if (result.count === 0) return apiError('NOT_FOUND', 'Clinic not found', 404);
    await logPlatformAction(
      admin.id,
      status === 'SUSPENDED' ? 'clinic.suspend' : 'clinic.reactivate',
      { type: 'Clinic', id },
      { reason: why || null },
      getClientIp(request)
    );
    return NextResponse.json({ ok: true });
  }
);
