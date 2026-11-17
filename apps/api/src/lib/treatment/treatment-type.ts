import { assertCanAddOne } from '../plan/limits';
import { prisma } from '../prisma/client';
import { currentClinicId } from '../tenancy/context';

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
  // Raw SQL is not scoped by the Prisma extension, so it filters by clinic itself.
  const rows = await prisma.$queryRaw<
    { treatmentTypeId: string; patientCount: number; lastUsedAt: Date | null }[]
  >`
    SELECT ti."treatmentTypeId" AS "treatmentTypeId",
           COUNT(DISTINCT t."patientId")::int AS "patientCount",
           MAX(t."fecha") AS "lastUsedAt"
    FROM "TreatmentItem" ti
    JOIN "Treatment" t ON t."id" = ti."treatmentId"
    WHERE ti."clinicId" = ${currentClinicId()}
    GROUP BY ti."treatmentTypeId"
  `;
  return new Map(
    rows.map((r) => [
      r.treatmentTypeId,
      { patientCount: Number(r.patientCount), lastUsedAt: r.lastUsedAt },
    ])
  );
}

/** Free caps active treatment types (see PLAN_LIMITS); inactive ones do not count. */
export async function createTreatmentType(name: string, sections: TreatmentTypeSections) {
  await assertCanAddOne('treatmentTypes');
  return prisma.treatmentType.create({ data: { name, ...sections } });
}

export async function updateTreatmentType(id: string, data: TreatmentTypeUpdateData) {
  if (data.active === true) {
    const current = await prisma.treatmentType.findUniqueOrThrow({ where: { id }, select: { active: true } });
    if (!current.active) await assertCanAddOne('treatmentTypes');
  }
  return prisma.treatmentType.update({ where: { id }, data });
}
