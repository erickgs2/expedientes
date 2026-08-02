import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'rbac-admin', 'edit');

    const { id } = await params;
    const body = (await request.json()) as { name?: string; permissionIds?: string[] };

    await prisma.$transaction(async (tx) => {
      if (body.name !== undefined) {
        await tx.role.update({ where: { id }, data: { name: body.name } });
      }
      if (body.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: body.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    });

    // Intentionally outside the transaction above: the permission change is the operation that
    // must be durable, and a failed audit write must not roll it back or 500 the client.
    await writeAuditLogSafe({ userId, action: 'update', entity: 'Role', entityId: id });

    return NextResponse.json({ ok: true });
  }
);
