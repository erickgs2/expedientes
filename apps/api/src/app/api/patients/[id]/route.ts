import { NextRequest, NextResponse } from 'next/server';
import { getPatientById } from '../../../../lib/patients/patient-search';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'patients', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const { id } = await params;
  const patient = await getPatientById(id);
  if (!patient) return apiError('NOT_FOUND', 'Patient not found', 404);

  await writeAuditLog({ userId, action: 'view', entity: 'Patient', entityId: patient.id, patientId: patient.id });

  return NextResponse.json({ patient });
}
