import { prisma } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';

/**
 * NOM-004-SSA3-2012 5.4: a clinical record is kept for at least five years counted from the last
 * medical act. MedCloud therefore archives a patient instead of deleting them; the record leaves
 * every work list, stays readable (and exportable), and can be restored. Purging for good is a
 * separate, owner-only step that only opens once those five years have passed.
 */
export const RETENTION_YEARS = 5;

const MAX_REASON_LENGTH = 500;

export function normalizeArchiveReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const reason = raw.trim();
  if (!reason || reason.length > MAX_REASON_LENGTH) return null;
  return reason;
}

/**
 * Archives a patient. Their future appointments are cancelled in the same transaction, so the
 * calendar, the day's desk and the WhatsApp reminders stop counting on someone who is no longer
 * being seen. Returns null when the patient does not exist; an already archived patient is left as
 * it was archived (first archive wins).
 */
export async function archivePatient(patientId: string, userId: string, reason: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { id: true, archivedAt: true } });
    if (!patient) return null;
    if (patient.archivedAt) return { alreadyArchived: true as const, cancelledAppointments: 0 };
    await tx.patient.update({
      where: { id: patientId },
      data: { archivedAt: now, archivedById: userId, archiveReason: reason },
    });
    const cancelled = await tx.appointment.updateMany({
      where: { patientId, startTime: { gt: now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      data: { status: 'CANCELLED' },
    });
    return { alreadyArchived: false as const, cancelledAppointments: cancelled.count };
  });
}

/** Returns false when the patient does not exist. Appointments cancelled on archive stay cancelled. */
export async function restorePatient(patientId: string): Promise<boolean> {
  const result = await prisma.patient.updateMany({
    where: { id: patientId, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null, archiveReason: null },
  });
  if (result.count > 0) return true;
  return (await prisma.patient.count({ where: { id: patientId } })) > 0;
}

/**
 * The date of the last medical act: the latest valoración or treatment visit, or the registration
 * date for a patient who never had one. The five-year retention runs from here.
 */
export async function lastCareAt(patientId: string): Promise<Date | null> {
  const [patient, valoracion, treatment] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId }, select: { createdAt: true } }),
    prisma.valoracion.findFirst({ where: { patientId }, orderBy: { fecha: 'desc' }, select: { fecha: true } }),
    prisma.treatment.findFirst({ where: { patientId }, orderBy: { fecha: 'desc' }, select: { fecha: true } }),
  ]);
  if (!patient) return null;
  return [patient.createdAt, valoracion?.fecha, treatment?.fecha]
    .filter((d): d is Date => d instanceof Date)
    .reduce((latest, d) => (d > latest ? d : latest));
}

/** The first moment a patient whose last care was `lastCare` may be purged. */
export function purgeAllowedFrom(lastCare: Date): Date {
  const allowed = new Date(lastCare);
  allowed.setFullYear(allowed.getFullYear() + RETENTION_YEARS);
  return allowed;
}

/**
 * Refuses any change to an archived patient's record. Called by every route that writes to a
 * patient's chart, so an archived record is read-only until someone restores it.
 */
export async function assertPatientWritable(patientId: string | null | undefined): Promise<void> {
  if (!patientId) return;
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { archivedAt: true } });
  if (patient?.archivedAt) {
    throw new ApiProblem('PATIENT_ARCHIVED', 'This patient is archived; restore the record to change it', 409);
  }
}

/** The patient a valoración, treatment, treatment item or appointment belongs to (null when it does not exist). */
export async function patientIdOf(
  kind: 'valoracion' | 'treatment' | 'treatmentItem' | 'appointment',
  id: string
): Promise<string | null> {
  switch (kind) {
    case 'valoracion':
      return (await prisma.valoracion.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case 'treatment':
      return (await prisma.treatment.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case 'treatmentItem':
      return (
        (await prisma.treatmentItem.findUnique({ where: { id }, select: { treatment: { select: { patientId: true } } } }))
          ?.treatment.patientId ?? null
      );
    case 'appointment':
      return (await prisma.appointment.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
  }
}

/** `assertPatientWritable` for a route that is addressed by one of the patient's records. */
export async function assertRecordWritable(
  kind: 'valoracion' | 'treatment' | 'treatmentItem' | 'appointment',
  id: string
): Promise<void> {
  await assertPatientWritable(await patientIdOf(kind, id));
}
