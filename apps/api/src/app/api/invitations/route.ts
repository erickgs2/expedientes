import { NextRequest, NextResponse } from 'next/server';
import type { InvitationInput } from '@expedientes/shared-types';
import { requireAuth } from '../../../lib/http/require-auth';
import { createInvitation, listPendingInvitations } from '../../../lib/invitations/invitations';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { withApiErrors } from '../../../lib/http/with-api-errors';

/** The clinic's invitations still waiting for an answer. */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'rbac-admin', 'view');
  return NextResponse.json({ invitations: await listPendingInvitations() });
});

/** Invites someone by email, with a role. Users join the clinic only by accepting an invitation. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'rbac-admin', 'create');
  const body = (await request.json()) as Partial<InvitationInput>;
  const invitation = await createInvitation(body.email, body.roleId, userId);
  await writeAuditLogSafe({ userId, action: 'create', entity: 'Invitation', entityId: invitation.id });
  return NextResponse.json({ invitation }, { status: 201 });
});
