import { prisma } from '../prisma/client';

export interface TreatmentTypeUpdateData {
  name?: string;
  consentTemplate?: string;
  active?: boolean;
}

export async function listTreatmentTypes() {
  return prisma.treatmentType.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function createTreatmentType(name: string, consentTemplate: string) {
  return prisma.treatmentType.create({
    data: { name, consentTemplate },
  });
}

export async function updateTreatmentType(id: string, data: TreatmentTypeUpdateData) {
  return prisma.treatmentType.update({ where: { id }, data });
}
