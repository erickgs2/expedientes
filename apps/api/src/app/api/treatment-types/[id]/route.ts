import { NextRequest, NextResponse } from 'next/server';
import { updateTreatmentType } from '../../../../lib/treatment/treatment-type';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    const body = (await request.json()) as {
      name?: string;
      consentDescription?: string;
      consentRisks?: string | null;
      consentAlternatives?: string | null;
      consentAftercare?: string | null;
      consentContraindications?: string | null;
      active?: boolean;
    };

    if (body.name !== undefined && !body.name) {
      return apiError('INVALID_INPUT', 'name cannot be empty', 400);
    }
    if (body.consentDescription !== undefined && !body.consentDescription) {
      return apiError('INVALID_INPUT', 'consentDescription cannot be empty', 400);
    }

    // An empty string on an optional section is normalized to `null` so a cleared textarea
    // removes the section rather than emitting a blank heading on the generated consent.
    const normalizeOptional = (value: string | null | undefined) =>
      value !== undefined ? value || null : undefined;

    // No existence pre-check needed: if `id` doesn't exist, Prisma's update throws P2025, which
    // `withApiErrors` already maps to a 404 — see apps/api/src/lib/http/with-api-errors.ts.
    const treatmentType = await updateTreatmentType(id, {
      name: body.name,
      consentDescription: body.consentDescription,
      consentRisks: normalizeOptional(body.consentRisks),
      consentAlternatives: normalizeOptional(body.consentAlternatives),
      consentAftercare: normalizeOptional(body.consentAftercare),
      consentContraindications: normalizeOptional(body.consentContraindications),
      active: body.active,
    });

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'TreatmentType',
      entityId: treatmentType.id,
    });

    return NextResponse.json({ treatmentType });
  }
);
