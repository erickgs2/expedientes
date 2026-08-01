import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'rbac-admin', 'edit');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

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

  await writeAuditLog({ userId, action: 'update', entity: 'Role', entityId: id });

  return NextResponse.json({ ok: true });
}
