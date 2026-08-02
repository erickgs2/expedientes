import { NextRequest, NextResponse } from 'next/server';
import {
  updateValoracionDiagrams,
  VIEW_KEY_TO_ENUM,
  type DiagramViewsUpdate,
} from '../../../../../lib/valoracion/valoracion';
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
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id } = await params;
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

    // No existence pre-check for most cases: `upsert`/`deleteMany` on a bad `valoracionId` either
    // no-ops (deleteMany) or fails the FK constraint (upsert's create), both handled below. The one
    // case that needs an explicit check is an all-omitted-or-empty `views` body against a bad id,
    // where no database operation runs at all to surface the error — `getValoracion` returning
    // `null` catches that.
    const valoracion = await updateValoracionDiagrams(id, body.views as DiagramViewsUpdate);
    if (!valoracion) {
      return apiError('NOT_FOUND', 'Valoración not found', 404);
    }

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'Valoracion',
      entityId: valoracion.id,
      patientId: valoracion.patientId,
    });

    return NextResponse.json({ valoracion });
  }
);
