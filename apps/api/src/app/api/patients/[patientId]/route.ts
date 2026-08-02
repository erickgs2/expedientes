import { NextRequest, NextResponse } from 'next/server';
import { getPatientById } from '../../../../lib/patients/patient-search';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'view');

    const { patientId } = await params;
    const patient = await getPatientById(patientId);
    if (!patient) return apiError('NOT_FOUND', 'Patient not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'Patient',
      entityId: patient.id,
      patientId: patient.id,
    });

    return NextResponse.json({ patient });
  }
);
