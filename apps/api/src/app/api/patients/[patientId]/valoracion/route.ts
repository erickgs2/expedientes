import { NextRequest, NextResponse } from 'next/server';
import { listValoraciones, createValoracion } from '../../../../../lib/valoracion/valoracion';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'view');
    const { patientId } = await params;

    const valoraciones = await listValoraciones(patientId);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'ValoracionList',
      entityId: patientId,
      patientId,
    });

    return NextResponse.json({ valoraciones });
  }
);

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'create');
    const { patientId } = await params;

    const valoracion = await createValoracion(patientId);

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'Valoracion',
      entityId: valoracion.id,
      patientId,
    });

    return NextResponse.json({ valoracion }, { status: 201 });
  }
);
