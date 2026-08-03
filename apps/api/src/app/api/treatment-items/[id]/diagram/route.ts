import { NextRequest, NextResponse } from 'next/server';
import {
  updateTreatmentItemDiagrams,
  VIEW_KEY_TO_ENUM,
  type DiagramViewsUpdate,
} from '../../../../../lib/treatment/diagram';
import { getTreatmentItemDetail } from '../../../../../lib/treatment/consent';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

// Derived from the service's mapping rather than typed out again, so request validation and the
// key→enum mapping can never disagree about which views exist.
const VALID_VIEW_KEYS = Object.keys(VIEW_KEY_TO_ENUM);

interface DiagramBody {
  views?: Record<string, Record<string, unknown> | null>;
}

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Unlike Valoración's diagram route, this one has a cheap existing existence-check function
    // (`getTreatmentItemDetail`) already available, so use it directly rather than relying on the
    // save function's own return value to distinguish "not found" from "no diagrams yet."
    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    const body = (await request.json()) as DiagramBody;
    if (!body.views || typeof body.views !== 'object') {
      return apiError('INVALID_INPUT', 'views is required', 400);
    }
    for (const [key, value] of Object.entries(body.views)) {
      if (!VALID_VIEW_KEYS.includes(key)) {
        return apiError('INVALID_INPUT', `Unknown view "${key}"`, 400);
      }
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
        return apiError('INVALID_INPUT', `Invalid data for view "${key}"`, 400);
      }
    }

    const diagrams = await updateTreatmentItemDiagrams(id, body.views as DiagramViewsUpdate);

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'TreatmentItem',
      entityId: id,
      patientId: item.patientId,
    });

    return NextResponse.json({ diagrams });
  }
);
