import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '../auth/session';
import { authorize, ForbiddenError, InactiveUserError, resolveMembership } from '../rbac/permissions';
import { setCurrentClinic } from '../tenancy/context';

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

/**
 * For the user's own things (profile, signing PIN, their unsigned notes): signed in and an active
 * member, with no particular permission. Sets the clinic like `requireAuth`. Returns the user's id.
 */
export async function requireSignedIn(request: NextRequest): Promise<string> {
  const session = getSessionFromRequest(request);
  if (!session) throw new UnauthenticatedError('Not logged in');
  const membership = await resolveMembership(session.sub, session.cid);
  setCurrentClinic(membership.clinicId);
  return session.sub;
}
