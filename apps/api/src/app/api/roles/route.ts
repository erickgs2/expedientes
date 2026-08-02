import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'rbac-admin', 'view');

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
});

export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'rbac-admin', 'create');

  const body = (await request.json()) as { name?: string };
  if (!body.name) return apiError('INVALID_INPUT', 'name is required', 400);

  const created = await prisma.role.create({ data: { name: body.name } });
  await writeAuditLogSafe({ userId, action: 'create', entity: 'Role', entityId: created.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
});
