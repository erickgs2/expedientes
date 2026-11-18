import { NextRequest, NextResponse } from 'next/server';
import { retireTreatmentItemPhoto } from '../../../../../../lib/treatment/photo';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';
import { assertPatientWritable, patientIdOf } from '../../../../../../lib/patients/patient-archive';

/** Retires the photo from the item's gallery; nothing is deleted (see the valoración photo route). */
export const DELETE = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; photoId: string }> }
  ) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id, photoId } = await params;

    const patientId = await patientIdOf('treatmentItem', id);
    if (!patientId) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    await assertPatientWritable(patientId);

    const retired = await retireTreatmentItemPhoto(id, photoId, userId);
    if (!retired) return apiError('NOT_FOUND', 'Photo not found', 404);

    await writeAuditLogSafe({ userId, action: 'archive', entity: 'TreatmentItemPhoto', entityId: photoId, patientId });

    return NextResponse.json({ ok: true });
  }
);
