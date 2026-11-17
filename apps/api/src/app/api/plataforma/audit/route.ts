import { NextRequest, NextResponse } from 'next/server';
import type { PlatformAuditEntry } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../lib/prisma/client';
import { requirePlatformAdmin } from '../../../../lib/platform/require-admin';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** The latest 300 actions taken from the portal. */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requirePlatformAdmin(request);
  const rows = await prismaUnscoped.platformAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { admin: { select: { email: true } } },
  });
  const entries: PlatformAuditEntry[] = rows.map((row) => ({
    id: row.id,
    adminEmail: row.admin.email,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    details: row.details,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  }));
  return NextResponse.json({ entries });
});
