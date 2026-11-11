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

export interface TreatmentTypeUsageRow {
  patientCount: number;
  lastUsedAt: Date | null;
}

/**
 * How widely each treatment type has been used: distinct patients and the most recent visit date.
 * Read-only and computed on demand for the catalog screen — nothing is stored. Types that were
 * never used are simply absent from the map.
 */
export async function getTreatmentTypeUsage(): Promise<Map<string, TreatmentTypeUsageRow>> {
  const rows = await prisma.$queryRaw<
    { treatmentTypeId: string; patientCount: number; lastUsedAt: Date | null }[]
  >`
    SELECT ti."treatmentTypeId" AS "treatmentTypeId",
           COUNT(DISTINCT t."patientId")::int AS "patientCount",
           MAX(t."fecha") AS "lastUsedAt"
    FROM "TreatmentItem" ti
    JOIN "Treatment" t ON t."id" = ti."treatmentId"
    GROUP BY ti."treatmentTypeId"
  `;
  return new Map(
    rows.map((r) => [
      r.treatmentTypeId,
      { patientCount: Number(r.patientCount), lastUsedAt: r.lastUsedAt },
    ])
  );
}

export async function createTreatmentType(name: string, sections: TreatmentTypeSections) {
  return prisma.treatmentType.create({ data: { name, ...sections } });
}

export async function updateTreatmentType(id: string, data: TreatmentTypeUpdateData) {
  return prisma.treatmentType.update({ where: { id }, data });
}
