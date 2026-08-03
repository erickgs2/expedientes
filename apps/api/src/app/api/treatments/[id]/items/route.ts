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

    // Unlike a plain `update`, `deleteMany`/`upsert` don't throw on a nonexistent parent id —
    // without this explicit check a PATCH to a made-up id would silently succeed having done
    // nothing, instead of 404ing.
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
    const treatmentTypeIds = body.items.map((item) => item.treatmentTypeId as string);
    if (new Set(treatmentTypeIds).size !== treatmentTypeIds.length) {
      return apiError('INVALID_INPUT', 'Duplicate treatmentTypeId in items', 400);
    }

    // A treatment type with a signed consent can never be dropped from the visit's selection —
    // the frontend already locks its checkbox, but this is the authoritative, server-side
    // enforcement: the UI lock alone would not stop a direct API call.
    const submittedTypeIds = new Set(treatmentTypeIds);
    const removedSignedItems = existing.items.filter(
      (item) => item.hasConsent && !submittedTypeIds.has(item.treatmentTypeId)
    );
    if (removedSignedItems.length > 0) {
      return apiError(
        'INVALID_INPUT',
        `Cannot remove treatment type(s) with a signed consent: ${removedSignedItems
          .map((item) => item.treatmentTypeId)
          .join(', ')}`,
        400
      );
    }

    const treatment = await replaceTreatmentItems(
      id,
      (body.items as { treatmentTypeId: string; notes?: string | null }[]).map((item) => ({
        treatmentTypeId: item.treatmentTypeId,
        notes: item.notes ?? null,
      }))
    );
    if (!treatment) return apiError('NOT_FOUND', 'Treatment not found', 404);

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
