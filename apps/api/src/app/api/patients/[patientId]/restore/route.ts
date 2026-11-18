import { NextRequest, NextResponse } from 'next/server';
import { restorePatient } from '../../../../../lib/patients/patient-archive';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** Puts an archived patient back on the work lists. Same permission as archiving. */
export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'delete');
    const { patientId } = await params;

    const found = await restorePatient(patientId);
    if (!found) return apiError('NOT_FOUND', 'Patient not found', 404);

    await writeAuditLogSafe({ userId, action: 'restore', entity: 'Patient', entityId: patientId, patientId });
    return NextResponse.json({ restored: true });
  }
);
