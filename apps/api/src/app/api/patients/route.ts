import { NextRequest, NextResponse } from 'next/server';
import { searchPatients, createPatient } from '../../../lib/patients/patient-search';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'patients', 'view');

  const query = request.nextUrl.searchParams.get('q') ?? '';
  const patients = await searchPatients(query);

  // A search returns up to 20 full patient records, so it is audited just like reading one.
  await writeAuditLogSafe({
    userId,
    action: 'view',
    entity: 'PatientSearch',
    entityId: query || '(all)',
  });

  return NextResponse.json({ patients });
});

export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'patients', 'create');

  const body = (await request.json()) as { fullName?: string; phone?: string; documentId?: string };
  if (!body.fullName || !body.phone) {
    return apiError('INVALID_INPUT', 'fullName and phone are required', 400);
  }

  const patient = await createPatient({
    fullName: body.fullName,
    phone: body.phone,
    // The CURP is optional at registration. A blank one is stored as NULL rather than an empty
    // string so "not recorded" stays distinguishable from "recorded as empty".
    documentId: body.documentId?.trim() || null,
  });

  await writeAuditLogSafe({
    userId,
    action: 'create',
    entity: 'Patient',
    entityId: patient.id,
    patientId: patient.id,
  });

  return NextResponse.json({ patient }, { status: 201 });
});
