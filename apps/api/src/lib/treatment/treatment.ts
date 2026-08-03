import { prisma } from '../prisma/client';

export async function listTreatments(patientId: string) {
  const treatments = await prisma.treatment.findMany({
    where: { patientId },
    orderBy: { fecha: 'desc' },
    include: { items: { include: { treatmentType: true } } },
  });
  return treatments.map((t) => ({
    id: t.id,
    patientId: t.patientId,
    fecha: t.fecha,
    treatmentTypeNames: t.items.map((i) => i.treatmentType.name),
  }));
}

// `fecha` is optional: passing `undefined` lets Prisma fall back to the schema's `@default(now())`
// as a safety net. Callers that know the clinic's local calendar day (the route below) always
// supply it, since `now()` is a UTC instant that can land on the next calendar day — the same
// convention established for Valoración.
export async function createTreatment(patientId: string, fecha?: Date) {
  const treatment = await prisma.treatment.create({ data: { patientId, fecha } });
  return {
    id: treatment.id,
    patientId: treatment.patientId,
    fecha: treatment.fecha,
    treatmentTypeNames: [] as string[],
  };
}

export async function getTreatment(id: string) {
  const treatment = await prisma.treatment.findUnique({
    where: { id },
    include: { items: { include: { treatmentType: true } } },
  });
  if (!treatment) return null;
  return {
    id: treatment.id,
    patientId: treatment.patientId,
    fecha: treatment.fecha,
    items: treatment.items.map((i) => ({
      id: i.id,
      treatmentTypeId: i.treatmentTypeId,
      treatmentTypeName: i.treatmentType.name,
      notes: i.notes,
    })),
  };
}

export interface TreatmentItemInput {
  treatmentTypeId: string;
  notes: string | null;
}

/**
 * Replaces this treatment's entire item set in one transaction. Deleting-then-recreating (rather
 * than a diff/upsert) is correct and simple for this sub-project — nothing yet references a
 * `TreatmentItem` row's own id — but it will need to become a smarter diff once a later
 * sub-project attaches consent/diagram/photo data to individual items, so a re-save here can't
 * silently destroy that data by deleting the row it's attached to. Flagged for that sub-project's
 * own design, not fixed here.
 */
export async function replaceTreatmentItems(treatmentId: string, items: TreatmentItemInput[]) {
  await prisma.$transaction([
    prisma.treatmentItem.deleteMany({ where: { treatmentId } }),
    prisma.treatmentItem.createMany({
      data: items.map((item) => ({
        treatmentId,
        treatmentTypeId: item.treatmentTypeId,
        notes: item.notes,
      })),
    }),
  ]);
  return getTreatment(treatmentId);
}
