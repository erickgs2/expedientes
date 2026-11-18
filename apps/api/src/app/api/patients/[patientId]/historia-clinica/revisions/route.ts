import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma/client';
import { ensureBaseRevision, listRevisions } from '../../../../../../lib/historia-clinica/revisions';
import { noteContent } from '../../../../../../lib/signature/note-signature';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

/** Every version of the patient's historia clínica, newest first, with what changed in each. */
export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'historia-clinica', 'view');
    const { patientId } = await params;
    const historia = await prisma.historiaClinica.findUnique({ where: { patientId }, select: { id: true } });
    if (!historia) return apiError('NOT_FOUND', 'This patient has no historia clínica', 404);

    const note = await noteContent('historiaClinica', historia.id);
    if (note) await ensureBaseRevision(historia.id, note.content);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'HistoriaClinicaRevision',
      entityId: historia.id,
      patientId,
    });
    return NextResponse.json({ revisions: await listRevisions(historia.id) });
  }
);
