import { prisma } from '../prisma/client';

export interface TreatmentTypeSections {
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
}

export interface TreatmentTypeUpdateData extends Partial<TreatmentTypeSections> {
  name?: string;
  active?: boolean;
}

export async function listTreatmentTypes() {
  return prisma.treatmentType.findMany({ orderBy: { name: 'asc' } });
}

export async function createTreatmentType(name: string, sections: TreatmentTypeSections) {
  return prisma.treatmentType.create({ data: { name, ...sections } });
}

export async function updateTreatmentType(id: string, data: TreatmentTypeUpdateData) {
  return prisma.treatmentType.update({ where: { id }, data });
}
