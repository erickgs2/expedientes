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
    include: { items: { include: { treatmentType: true, consent: true } } },
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
      hasConsent: !!i.consent,
    })),
  };
}

export interface TreatmentItemInput {
  treatmentTypeId: string;
  notes: string | null;
}

/**
 * Replaces this treatment's item set with the submitted one, preserving each surviving item's own
 * `id` (and therefore any `Consent` row attached to it) via an upsert keyed on
 * `(treatmentId, treatmentTypeId)`, rather than the delete-then-recreate approach used before
 * consents existed. Only items genuinely absent from `items` are deleted — callers are expected to
 * have already confirmed none of those have a signed consent (see the item-save route), since this
 * function does not re-check that itself.
 */
export async function replaceTreatmentItems(treatmentId: string, items: TreatmentItemInput[]) {
  const existingItems = await prisma.treatmentItem.findMany({
    where: { treatmentId },
    select: { id: true, treatmentTypeId: true },
  });
  const submittedTypeIds = new Set(items.map((item) => item.treatmentTypeId));
  const toDeleteIds = existingItems
    .filter((item) => !submittedTypeIds.has(item.treatmentTypeId))
    .map((item) => item.id);

  const operations = [
    ...(toDeleteIds.length > 0
      ? [prisma.treatmentItem.deleteMany({ where: { id: { in: toDeleteIds } } })]
      : []),
    ...items.map((item) =>
      prisma.treatmentItem.upsert({
        where: {
          treatmentId_treatmentTypeId: { treatmentId, treatmentTypeId: item.treatmentTypeId },
        },
        update: { notes: item.notes },
        create: { treatmentId, treatmentTypeId: item.treatmentTypeId, notes: item.notes },
      })
    ),
  ];
  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
  return getTreatment(treatmentId);
}
