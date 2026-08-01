import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { hashPassword } from '../../../../lib/auth/password';
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
  await writeAuditLog({ userId, action: 'update', entity: 'User', entityId: id });

  return NextResponse.json({ ok: true });
}
