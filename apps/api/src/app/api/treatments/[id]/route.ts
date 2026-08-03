import { NextRequest, NextResponse } from 'next/server';
import { getTreatment } from '../../../../lib/treatment/treatment';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { id } = await params;

    const treatment = await getTreatment(id);
    if (!treatment) return apiError('NOT_FOUND', 'Treatment not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'Treatment',
      entityId: treatment.id,
      patientId: treatment.patientId,
    });

    return NextResponse.json({ treatment });
  }
);
