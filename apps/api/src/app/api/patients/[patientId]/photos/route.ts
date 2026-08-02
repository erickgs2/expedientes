import { NextRequest, NextResponse } from 'next/server';
import { listPatientPhotos } from '../../../../../lib/photo/photo';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'view');
    const { patientId } = await params;

    const photos = await listPatientPhotos(patientId);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'PatientPhotoTimeline',
      entityId: patientId,
      patientId,
    });

    return NextResponse.json({ photos });
  }
);
