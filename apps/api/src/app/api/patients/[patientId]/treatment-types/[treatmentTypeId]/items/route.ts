import { NextRequest, NextResponse } from 'next/server';
import { listTreatmentItemsByType } from '../../../../../../../lib/treatment/diagram';
import { writeAuditLogSafe } from '../../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ patientId: string; treatmentTypeId: string }> }
  ) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { patientId, treatmentTypeId } = await params;

    const items = await listTreatmentItemsByType(patientId, treatmentTypeId);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'TreatmentItemsByType',
      entityId: treatmentTypeId,
      patientId,
    });

    return NextResponse.json({ items });
  }
);
