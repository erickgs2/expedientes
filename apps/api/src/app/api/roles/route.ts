import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { writeAuditLog } from '../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, 'rbac-admin', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`),
    })),
  });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'rbac-admin', 'create');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const body = (await request.json()) as { name?: string };
  if (!body.name) return apiError('INVALID_INPUT', 'name is required', 400);

  const created = await prisma.role.create({ data: { name: body.name } });
  await writeAuditLog({ userId, action: 'create', entity: 'Role', entityId: created.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
