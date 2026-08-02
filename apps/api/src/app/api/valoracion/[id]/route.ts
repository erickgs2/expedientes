import { NextRequest, NextResponse } from 'next/server';
import { getValoracion, updateValoracion } from '../../../../lib/valoracion/valoracion';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

interface ValoracionBody {
  fecha?: string;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  notas?: string | null;
}

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'view');
    const { id } = await params;

    const valoracion = await getValoracion(id);
    if (!valoracion) return apiError('NOT_FOUND', 'Valoración not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'Valoracion',
      entityId: valoracion.id,
      patientId: valoracion.patientId,
    });

    return NextResponse.json({ valoracion });
  }
);

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id } = await params;
    const body = (await request.json()) as ValoracionBody;

    // No existence pre-check needed: if `id` doesn't exist, Prisma's update throws P2025, which
    // `withApiErrors` already maps to a 404 — see apps/api/src/lib/http/with-api-errors.ts.
    const valoracion = await updateValoracion(id, {
      fecha: body.fecha ? new Date(body.fecha) : undefined,
      queQuiereElPaciente: body.queQuiereElPaciente,
      queNecesitaElPaciente: body.queNecesitaElPaciente,
      notas: body.notas,
    });

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
