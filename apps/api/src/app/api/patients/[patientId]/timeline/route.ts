import { NextRequest, NextResponse } from 'next/server';
import { getPatientTimeline } from '../../../../../lib/patients/patient-timeline';
import { getUserPermissions } from '../../../../../lib/rbac/permissions';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/**
 * The patient overview's timeline: appointments, valoraciones and treatments in one list. Each
 * kind is included only with its own view permission, checked here on the server.
 */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'view');
    const { patientId } = await params;

    const granted = await getUserPermissions(userId);
    const timeline = await getPatientTimeline(patientId, {
      appointments: granted.includes('appointments:view'),
      valoraciones: granted.includes('valoracion:view'),
      treatments: granted.includes('treatments:view'),
    });
    if (!timeline) return apiError('NOT_FOUND', 'Patient not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'PatientTimeline',
      entityId: patientId,
      patientId,
    });

    return NextResponse.json({ timeline });
  }
);
