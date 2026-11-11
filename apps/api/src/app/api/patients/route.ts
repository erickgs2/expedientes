import { NextRequest, NextResponse } from 'next/server';
import { searchPatients, createPatient } from '../../../lib/patients/patient-search';
import { checkContactLink, CONTACT_LINK_MESSAGES } from '../../../lib/patients/notification-contact';
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

  const body = (await request.json()) as {
    fullName?: string;
    phone?: string;
    documentId?: string;
    contactPatientId?: string;
  };
  const phone = body.phone?.trim() ?? '';
  const contactPatientId = body.contactPatientId?.trim() || null;
  // A phone is required unless the patient's notices go to a companion's phone instead — the
  // usual case for someone who always comes with a partner, mother or daughter.
  if (!body.fullName?.trim() || (!phone && !contactPatientId)) {
    return apiError('INVALID_INPUT', 'fullName and phone (or contactPatientId) are required', 400);
  }
  if (contactPatientId) {
    const problem = await checkContactLink(null, contactPatientId);
    if (problem) return apiError(problem, CONTACT_LINK_MESSAGES[problem], 400);
  }

  const patient = await createPatient({
    fullName: body.fullName.trim(),
    phone,
    contactPatientId,
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
