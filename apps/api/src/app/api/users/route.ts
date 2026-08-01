import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { hashPassword } from '../../../lib/auth/password';
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

  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { fullName: 'asc' },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      language: u.language,
      active: u.active,
      roleId: u.roleId,
      roleName: u.role.name,
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

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    fullName?: string;
    roleId?: string;
    language?: string;
  };

  if (!body.email || !body.password || !body.fullName || !body.roleId) {
    return apiError('INVALID_INPUT', 'email, password, fullName, and roleId are required', 400);
  }

  const created = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      fullName: body.fullName,
      roleId: body.roleId,
      language: body.language ?? 'es',
    },
  });

  await writeAuditLog({ userId, action: 'create', entity: 'User', entityId: created.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
