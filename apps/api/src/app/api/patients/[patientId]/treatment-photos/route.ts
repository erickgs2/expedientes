import { NextRequest, NextResponse } from 'next/server';
import { listPatientTreatmentPhotos } from '../../../../../lib/treatment/photo';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { patientId } = await params;

    const photos = await listPatientTreatmentPhotos(patientId);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'PatientTreatmentPhotoTimeline',
      entityId: patientId,
      patientId,
    });

    return NextResponse.json({ photos });
  }
);
