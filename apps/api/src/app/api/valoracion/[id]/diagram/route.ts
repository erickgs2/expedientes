import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { updateValoracionDiagram } from '../../../../../lib/valoracion/valoracion';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

interface DiagramBody {
  diagramData: Record<string, unknown>;
}

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id } = await params;
    const body = (await request.json()) as DiagramBody;

    if (!body.diagramData || typeof body.diagramData !== 'object') {
      return apiError('INVALID_INPUT', 'diagramData is required', 400);
    }

    // No existence pre-check needed: if `id` doesn't exist, Prisma's update throws P2025, which
    // `withApiErrors` already maps to a 404 — see apps/api/src/lib/http/with-api-errors.ts.
    const valoracion = await updateValoracionDiagram(
      id,
      body.diagramData as Prisma.InputJsonValue
    );

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
