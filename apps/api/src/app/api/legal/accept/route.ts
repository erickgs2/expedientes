import { NextRequest, NextResponse } from 'next/server';
import type { AcceptLegalRequest } from '@expedientes/shared-types';
import { getSessionFromRequest } from '../../../../lib/auth/session';
import { UnauthenticatedError } from '../../../../lib/http/require-auth';
import { resolveMembership } from '../../../../lib/rbac/permissions';
import { getClientIp } from '../../../../lib/auth/login-throttle';
import { prismaUnscoped } from '../../../../lib/prisma/client';
import { pendingLegalFor, recordLegalAcceptances } from '../../../../lib/legal/legal-documents';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/**
 * Accepts legal versions the signed-in user is asked to accept. Needs only a session, no
 * permission: every user must be able to accept, whatever their role. Only versions actually
 * pending for the user are recorded. Answers with what is still pending.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const session = getSessionFromRequest(request);
  if (!session) throw new UnauthenticatedError('Not logged in');
  const membership = await resolveMembership(session.sub, session.cid);
  const body = (await request.json()) as Partial<AcceptLegalRequest>;
  const requested = new Set(Array.isArray(body.documentIds) ? body.documentIds : []);
  const pending = await pendingLegalFor(membership.userId);
  const toAccept = pending.filter((doc) => requested.has(doc.id)).map((doc) => doc.id);
  if (toAccept.length) {
    await prismaUnscoped.$transaction((tx) =>
      recordLegalAcceptances(tx, membership.userId, toAccept, {
        ip: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
      })
    );
  }
  return NextResponse.json({ pendingLegal: await pendingLegalFor(membership.userId) });
});
