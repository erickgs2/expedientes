import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { requireSignedIn } from '../../../../lib/http/require-auth';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** How far back the day's desk looks for notes the user wrote and has not signed. */
const WINDOW_DAYS = 7;

/**
 * The current user's own notes from the last week that are still unsigned, for the reminder on
 * the day's desk. Archived patients and notes written before signatures existed are left out.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = await requireSignedIn(request);
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3_600_000);
  const where = {
    createdById: userId,
    signedAt: null,
    legacyRecord: false,
    createdAt: { gte: since },
    patient: { archivedAt: null },
  };
  const select = { id: true, createdAt: true, patientId: true, patient: { select: { fullName: true } } } as const;
  const [valoraciones, treatments, historias] = await Promise.all([
    prisma.valoracion.findMany({ where, select, orderBy: { createdAt: 'asc' } }),
    prisma.treatment.findMany({ where, select, orderBy: { createdAt: 'asc' } }),
    prisma.historiaClinica.findMany({ where, select, orderBy: { createdAt: 'asc' } }),
  ]);
  const notes = [
    ...valoraciones.map((n) => ({ kind: 'valoracion' as const, ...n })),
    ...treatments.map((n) => ({ kind: 'treatment' as const, ...n })),
    ...historias.map((n) => ({ kind: 'historiaClinica' as const, ...n })),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((n) => ({ kind: n.kind, id: n.id, patientId: n.patientId, patientName: n.patient.fullName, createdAt: n.createdAt.toISOString() }));
  return NextResponse.json({ notes });
});
