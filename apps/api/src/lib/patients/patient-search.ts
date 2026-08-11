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

export async function searchPatients(query: string) {
  return prisma.patient.findMany({
    where: buildPatientSearchWhere(query),
    orderBy: { fullName: 'asc' },
    take: 20,
  });
}

export interface CreatePatientData {
  fullName: string;
  phone: string;
  /** Null when no CURP was recorded at registration. */
  documentId: string | null;
}

export async function createPatient(data: CreatePatientData) {
  return prisma.patient.create({ data });
}

export async function getPatientById(id: string) {
  return prisma.patient.findUnique({ where: { id } });
}

export interface UpdatePatientData {
  /** `null` clears a previously recorded CURP; omitted leaves it untouched. */
  documentId?: string | null;
}

export async function updatePatient(id: string, data: UpdatePatientData) {
  return prisma.patient.update({ where: { id }, data });
}
