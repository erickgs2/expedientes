import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { hashPassword } from '../../../../lib/auth/password';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'rbac-admin', 'edit');

    const { id } = await params;

    const body = (await request.json()) as {
      fullName?: string;
      roleId?: string;
      language?: string;
      active?: boolean;
      newPassword?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.fullName !== undefined) data['fullName'] = body.fullName;
    if (body.roleId !== undefined) data['roleId'] = body.roleId;
    if (body.language !== undefined) data['language'] = body.language;
    if (body.active !== undefined) data['active'] = body.active;
    if (body.newPassword) data['passwordHash'] = await hashPassword(body.newPassword);

    await prisma.user.update({ where: { id }, data });
    await writeAuditLogSafe({ userId, action: 'update', entity: 'User', entityId: id });

    return NextResponse.json({ ok: true });
  }
);
