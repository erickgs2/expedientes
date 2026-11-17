import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/http/require-auth';
import { revokeInvitation } from '../../../../lib/invitations/invitations';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Cancels a pending invitation; its link stops working. */
export const DELETE = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'rbac-admin', 'create');
    const { id } = await params;
    await revokeInvitation(id);
    await writeAuditLogSafe({ userId, action: 'delete', entity: 'Invitation', entityId: id });
    return NextResponse.json({ ok: true });
  }
);
