import { NextRequest, NextResponse } from 'next/server';
import { getPatientById } from '../../../../../lib/patients/patient-search';
import { getPatientSummaryStats } from '../../../../../lib/patients/patient-summary';
import { getUserPermissions } from '../../../../../lib/rbac/permissions';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/**
 * Counts for the clinical-history screen's shortcut widgets.
 *
 * Deliberately no audit entry: this is aggregate counts on a screen already audited by the patient
 * `GET` beside it, and logging a second "view" for every landing would bury the reads that matter.
 */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'view');

    const { patientId } = await params;
    const patient = await getPatientById(patientId);
    if (!patient) return apiError('NOT_FOUND', 'Patient not found', 404);

    const permissions = await getUserPermissions(userId);
    const summary = await getPatientSummaryStats(patientId, {
      includeTreatmentPhotos: permissions.includes('treatments:view'),
    });

    return NextResponse.json({ summary });
  }
);
