import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, getUserIdFromRequest } from '../../../../lib/auth/session';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const POST = withApiErrors(async (request: NextRequest) => {
  // Read the session before clearing the cookie so the entry can be attributed to a user.
  const userId = getUserIdFromRequest(request);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);

  if (userId) {
    await writeAuditLogSafe({ userId, action: 'view', entity: 'Session', entityId: userId });
  }

  return response;
});
