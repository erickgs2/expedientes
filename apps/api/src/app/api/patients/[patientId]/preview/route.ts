import { NextRequest, NextResponse } from 'next/server';
import { getPatientPreview } from '../../../../../lib/patients/patient-preview';
import { getUserPermissions } from '../../../../../lib/rbac/permissions';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/**
 * The patient search's preview pane. Audited as a view of that patient: unlike the summary counts,
 * it shows identifying and clinical details (allergy flag, products and lots) before any record
 * screen is opened.
 */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'view');
    const { patientId } = await params;

    const granted = await getUserPermissions(userId);
    const preview = await getPatientPreview(patientId, {
      historia: granted.includes('historia-clinica:view'),
      treatments: granted.includes('treatments:view'),
      appointments: granted.includes('appointments:view'),
    });
    if (!preview) return apiError('NOT_FOUND', 'Patient not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'PatientPreview',
      entityId: patientId,
      patientId,
    });

    return NextResponse.json({ preview });
  }
);
