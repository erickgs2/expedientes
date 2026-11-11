import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

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

export async function searchPatients(query: string) {
  return prisma.patient.findMany({
    where: buildPatientSearchWhere(query),
    orderBy: { fullName: 'asc' },
    take: 20,
    include: { contactPatient: CONTACT_SELECT },
  });
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
  return prisma.patient.update({
    where: { id },
    data,
    include: {
      contactPatient: CONTACT_SELECT,
      dependents: { select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } },
    },
  });
}
