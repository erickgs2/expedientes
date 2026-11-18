import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { assertInClinic } from '../tenancy/assert';

export function buildPatientSearchWhere(query: string): Prisma.PatientWhereInput {
  const trimmed = query.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { fullName: { contains: trimmed, mode: 'insensitive' } },
      { phone: { contains: trimmed } },
      { documentId: { contains: trimmed } },
    ],
  };
}

/** The companion shown beside a patient whose notices go to someone else's phone. */
const CONTACT_SELECT = { select: { id: true, fullName: true, phone: true } } as const;

/**
 * Active patients by default. `archived: true` lists only the archived ones (the "Archivados" filter);
 * an active search also reports how many archived patients match, so the screen can point to them.
 */
export async function searchPatients(query: string, options: { archived?: boolean } = {}) {
  return prisma.patient.findMany({
    where: { ...buildPatientSearchWhere(query), archivedAt: options.archived ? { not: null } : null },
    orderBy: { fullName: 'asc' },
    take: 20,
    include: { contactPatient: CONTACT_SELECT },
  });
}

export async function countArchivedMatches(query: string): Promise<number> {
  if (!query.trim()) return 0;
  return prisma.patient.count({ where: { ...buildPatientSearchWhere(query), archivedAt: { not: null } } });
}

export interface CreatePatientData {
  fullName: string;
  /** Empty only when `contactPatientId` is set. */
  phone: string;
  /** Null when no CURP was recorded at registration. */
  documentId: string | null;
  contactPatientId?: string | null;
}

export async function createPatient(data: CreatePatientData) {
  await assertInClinic('patient', [data.contactPatientId]);
  return prisma.patient.create({ data, include: { contactPatient: CONTACT_SELECT } });
}

export async function getPatientById(id: string) {
  return prisma.patient.findUnique({
    where: { id },
    include: {
      contactPatient: CONTACT_SELECT,
      dependents: { select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } },
    },
  });
}

export interface UpdatePatientData {
  /** `null` clears a previously recorded CURP; omitted leaves it untouched. */
  documentId?: string | null;
  /**
   * Never null: the column is non-null and the number drives WhatsApp appointment reminders, so
   * clearing it would silently switch those off for this patient. Omitted leaves it untouched.
   */
  phone?: string;
  /** `null` unlinks the companion; omitted leaves it untouched. */
  contactPatientId?: string | null;
}

export async function updatePatient(id: string, data: UpdatePatientData) {
  await assertInClinic('patient', [data.contactPatientId]);
  return prisma.patient.update({
    where: { id },
    data,
    include: {
      contactPatient: CONTACT_SELECT,
      dependents: { select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } },
    },
  });
}
