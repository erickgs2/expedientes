import { NextRequest, NextResponse } from 'next/server';
import { getTreatmentItemDetail } from '../../../../lib/treatment/consent';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { id } = await params;

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'TreatmentItem',
      entityId: item.id,
      patientId: item.patientId,
    });

    return NextResponse.json({ item });
  }
);
