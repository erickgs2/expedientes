import { NextRequest, NextResponse } from 'next/server';
import { getTreatment } from '../../../../lib/treatment/treatment';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';
import { afterNoteEdit, beginNoteEdit, noteSignature } from '../../../../lib/signature/note-signature';
import { assertRecordWritable } from '../../../../lib/patients/patient-archive';
import { EVOLUTION_FIELDS, parseClinicalFields } from '../../../../lib/clinical/clinical-fields';
import { prisma } from '../../../../lib/prisma/client';

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

    return NextResponse.json({ treatment, signature: await noteSignature('treatment', treatment.id) });
  }
);

/**
 * The visit's nota de evolución (NOM-004-SSA3-2012 6.2): evolution, vital signs, results,
 * diagnosis, prognosis and instructions, all optional. Locked once the visit is signed.
 */
export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;
    await assertRecordWritable('treatment', id);
    const noteEdit = await beginNoteEdit('treatment', id);

    const existing = await getTreatment(id);
    if (!existing) return apiError('NOT_FOUND', 'Treatment not found', 404);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const evolution = parseClinicalFields(body, EVOLUTION_FIELDS);
    if (!evolution.ok) return apiError('INVALID_INPUT', evolution.error, 400);

    await prisma.treatment.update({ where: { id }, data: evolution.data });
    await writeAuditLogSafe({ userId, action: 'update', entity: 'Treatment', entityId: id, patientId: existing.patientId });
    await afterNoteEdit('treatment', id, userId, existing.patientId, noteEdit);

    const treatment = await getTreatment(id);
    return NextResponse.json({ treatment, signature: await noteSignature('treatment', id) });
  }
);
