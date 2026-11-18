import { NextRequest, NextResponse } from 'next/server';
import { restoreTreatmentItemPhoto } from '../../../../../../../lib/treatment/photo';
import { writeAuditLogSafe } from '../../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../../lib/http/with-api-errors';
import { assertPatientWritable, patientIdOf } from '../../../../../../../lib/patients/patient-archive';

/** Puts a retired photo back in the item's gallery. */
export const POST = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; photoId: string }> }
  ) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id, photoId } = await params;

    const patientId = await patientIdOf('treatmentItem', id);
    if (!patientId) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    await assertPatientWritable(patientId);

    const restored = await restoreTreatmentItemPhoto(id, photoId);
    if (!restored) return apiError('NOT_FOUND', 'Photo not found', 404);

    await writeAuditLogSafe({ userId, action: 'restore', entity: 'TreatmentItemPhoto', entityId: photoId, patientId });
    return NextResponse.json({ ok: true });
  }
);
