import { NextRequest, NextResponse } from 'next/server';
import { getTreatment, replaceTreatmentItems } from '../../../../../lib/treatment/treatment';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

interface ItemBody {
  treatmentTypeId?: unknown;
  notes?: unknown;
}

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Unlike a plain `update`, `deleteMany`/`createMany` don't throw on a nonexistent parent id —
    // `deleteMany` for a bad `treatmentId` just deletes zero rows, so without this explicit check
    // a PATCH to a made-up id would silently succeed having done nothing, instead of 404ing.
    const existing = await getTreatment(id);
    if (!existing) return apiError('NOT_FOUND', 'Treatment not found', 404);

    const body = (await request.json()) as { items?: ItemBody[] };
    if (!Array.isArray(body.items)) {
      return apiError('INVALID_INPUT', 'items must be an array', 400);
    }
    for (const item of body.items) {
      if (typeof item.treatmentTypeId !== 'string' || !item.treatmentTypeId) {
        return apiError('INVALID_INPUT', 'Each item requires a treatmentTypeId', 400);
      }
      if (item.notes !== null && item.notes !== undefined && typeof item.notes !== 'string') {
        return apiError('INVALID_INPUT', 'notes must be a string or null', 400);
      }
    }

    const treatment = await replaceTreatmentItems(
      id,
      (body.items as { treatmentTypeId: string; notes?: string | null }[]).map((item) => ({
        treatmentTypeId: item.treatmentTypeId,
        notes: item.notes ?? null,
      }))
    );

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'Treatment',
      entityId: id,
      patientId: existing.patientId,
    });

    return NextResponse.json({ treatment });
  }
);
