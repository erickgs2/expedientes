import { NextRequest, NextResponse } from 'next/server';
import { deletePhoto, getValoracionPatientId } from '../../../../../../lib/photo/photo';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

export const DELETE = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; photoId: string }> }
  ) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id, photoId } = await params;

    const patientId = await getValoracionPatientId(id);
    if (!patientId) return apiError('NOT_FOUND', 'Valoración not found', 404);

    const deleted = await deletePhoto(id, photoId);
    if (!deleted) return apiError('NOT_FOUND', 'Photo not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'delete',
      entity: 'Photo',
      entityId: photoId,
      patientId,
    });

    return NextResponse.json({ ok: true });
  }
);
