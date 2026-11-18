import { NextRequest, NextResponse } from 'next/server';
import { restorePhoto, getValoracionPatientId } from '../../../../../../../lib/photo/photo';
import { writeAuditLogSafe } from '../../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../../lib/http/with-api-errors';
import { assertPatientWritable } from '../../../../../../../lib/patients/patient-archive';

/** Puts a retired photo back in the valoración's gallery. */
export const POST = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; photoId: string }> }
  ) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id, photoId } = await params;

    const patientId = await getValoracionPatientId(id);
    if (!patientId) return apiError('NOT_FOUND', 'Valoración not found', 404);
    await assertPatientWritable(patientId);

    const restored = await restorePhoto(id, photoId);
    if (!restored) return apiError('NOT_FOUND', 'Photo not found', 404);

    await writeAuditLogSafe({ userId, action: 'restore', entity: 'Photo', entityId: photoId, patientId });
    return NextResponse.json({ ok: true });
  }
);
