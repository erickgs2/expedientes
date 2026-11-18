import { NextRequest, NextResponse } from 'next/server';
import { retirePhoto, getValoracionPatientId } from '../../../../../../lib/photo/photo';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';
import { assertPatientWritable } from '../../../../../../lib/patients/patient-archive';

/**
 * Retires the photo from the gallery. Nothing is deleted (NOM-004-SSA3-2012 5.4): the photo is
 * listed under "retired" and can be put back with `POST …/restore`.
 */
export const DELETE = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; photoId: string }> }
  ) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id, photoId } = await params;

    const patientId = await getValoracionPatientId(id);
    if (!patientId) return apiError('NOT_FOUND', 'Valoración not found', 404);
    await assertPatientWritable(patientId);

    const retired = await retirePhoto(id, photoId, userId);
    if (!retired) return apiError('NOT_FOUND', 'Photo not found', 404);

    await writeAuditLogSafe({ userId, action: 'archive', entity: 'Photo', entityId: photoId, patientId });

    return NextResponse.json({ ok: true });
  }
);
