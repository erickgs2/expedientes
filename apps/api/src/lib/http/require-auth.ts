import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '../auth/session';
import { authorize, ForbiddenError, InactiveUserError } from '../rbac/permissions';

export class UnauthenticatedError extends Error {}

/**
 * Authenticates the request, sets its clinic (every scoped query below this point is limited to
 * it), and checks the permission in that clinic. Returns the user's id.
 */
export async function requireAuth(
  request: NextRequest,
  module: string,
  action: string
): Promise<string> {
  const session = getSessionFromRequest(request);
  if (!session) {
    throw new UnauthenticatedError('Not logged in');
  }
  await authorize(session.sub, session.cid, module, action);
  return session.sub;
}

export { ForbiddenError, InactiveUserError };
