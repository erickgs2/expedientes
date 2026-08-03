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
      consentTemplate?: string;
      active?: boolean;
    };

    if (body.name !== undefined && !body.name) {
      return apiError('INVALID_INPUT', 'name cannot be empty', 400);
    }
    if (body.consentTemplate !== undefined && !body.consentTemplate) {
      return apiError('INVALID_INPUT', 'consentTemplate cannot be empty', 400);
    }

    // No existence pre-check needed: if `id` doesn't exist, Prisma's update throws P2025, which
    // `withApiErrors` already maps to a 404 — see apps/api/src/lib/http/with-api-errors.ts.
    const treatmentType = await updateTreatmentType(id, {
      name: body.name,
      consentTemplate: body.consentTemplate,
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
