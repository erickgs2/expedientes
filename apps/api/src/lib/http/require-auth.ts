import type { NextRequest } from 'next/server';
import { getUserIdFromRequest } from '../auth/session';
import { requirePermission, ForbiddenError, InactiveUserError } from '../rbac/permissions';

export class UnauthenticatedError extends Error {}

export async function requireAuth(
  request: NextRequest,
  module: string,
  action: string
): Promise<string> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    throw new UnauthenticatedError('Not logged in');
  }
  await requirePermission(userId, module, action);
  return userId;
}

export { ForbiddenError, InactiveUserError };
