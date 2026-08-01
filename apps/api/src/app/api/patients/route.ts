import { NextRequest, NextResponse } from 'next/server';
import { searchPatients, createPatient } from '../../../lib/patients/patient-search';
import { writeAuditLog } from '../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, 'patients', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const patients = await searchPatients(query);

  return NextResponse.json({ patients });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'patients', 'create');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const body = (await request.json()) as { fullName?: string; phone?: string; documentId?: string };
  if (!body.fullName || !body.phone || !body.documentId) {
    return apiError('INVALID_INPUT', 'fullName, phone, and documentId are required', 400);
  }

  const patient = await createPatient({
    fullName: body.fullName,
    phone: body.phone,
    documentId: body.documentId,
  });

  await writeAuditLog({ userId, action: 'create', entity: 'Patient', entityId: patient.id, patientId: patient.id });

  return NextResponse.json({ patient }, { status: 201 });
}
