import { NextRequest, NextResponse } from 'next/server';
import { deleteTreatmentItemPhoto } from '../../../../../../lib/treatment/photo';
import { getTreatmentItemDetail } from '../../../../../../lib/treatment/consent';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

export const DELETE = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; photoId: string }> }
  ) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id, photoId } = await params;

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    const deleted = await deleteTreatmentItemPhoto(id, photoId);
    if (!deleted) return apiError('NOT_FOUND', 'Photo not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'delete',
      entity: 'TreatmentItemPhoto',
      entityId: photoId,
      patientId: item.patientId,
    });

    return NextResponse.json({ ok: true });
  }
);
