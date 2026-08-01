import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
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

  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  return NextResponse.json({ permissions });
}
