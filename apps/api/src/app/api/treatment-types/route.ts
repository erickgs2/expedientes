import { NextRequest, NextResponse } from 'next/server';
import { createTreatmentType, listTreatmentTypes } from '../../../lib/treatment/treatment-type';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'treatments', 'view');

  const treatmentTypes = await listTreatmentTypes();

  return NextResponse.json({ treatmentTypes });
});

export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'treatments', 'create');

  const body = (await request.json()) as {
    name?: string;
    consentDescription?: string;
    consentRisks?: string | null;
    consentAlternatives?: string | null;
    consentAftercare?: string | null;
    consentContraindications?: string | null;
  };
  if (!body.name) return apiError('INVALID_INPUT', 'name is required', 400);
  if (!body.consentDescription) {
    return apiError('INVALID_INPUT', 'consentDescription is required', 400);
  }

  const treatmentType = await createTreatmentType(body.name, {
    consentDescription: body.consentDescription,
    consentRisks: body.consentRisks ?? null,
    consentAlternatives: body.consentAlternatives ?? null,
    consentAftercare: body.consentAftercare ?? null,
    consentContraindications: body.consentContraindications ?? null,
  });

  await writeAuditLogSafe({
    userId,
    action: 'create',
    entity: 'TreatmentType',
    entityId: treatmentType.id,
  });

  return NextResponse.json({ treatmentType }, { status: 201 });
});
