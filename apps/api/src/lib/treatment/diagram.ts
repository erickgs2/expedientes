import type { DiagramView, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export interface DiagramViewsUpdate {
  front?: Prisma.InputJsonValue | null;
  leftProfile?: Prisma.InputJsonValue | null;
  rightProfile?: Prisma.InputJsonValue | null;
}

/**
 * Single source of truth for the accepted view keys — see the identical comment on
 * `apps/api/src/lib/valoracion/valoracion.ts`'s `VIEW_KEY_TO_ENUM` for why this must stay
 * exhaustive over `DiagramViewsUpdate`.
 */
export const VIEW_KEY_TO_ENUM: Record<keyof DiagramViewsUpdate, DiagramView> = {
  front: 'FRONT',
  leftProfile: 'LEFT_PROFILE',
  rightProfile: 'RIGHT_PROFILE',
};

export async function getTreatmentItemDiagrams(treatmentItemId: string) {
  return prisma.treatmentItemDiagram.findMany({
    where: { treatmentItemId },
    select: { view: true, data: true, updatedAt: true },
  });
}

/**
 * Upserts or clears whichever views are present in `views`. A key mapped to `null` deletes that
 * view's row (if any); an omitted key is left untouched — same rule
 * `updateValoracionDiagrams` uses. All writes run in one transaction.
 */
export async function updateTreatmentItemDiagrams(treatmentItemId: string, views: DiagramViewsUpdate) {
  const operations = (
    Object.entries(views) as [keyof DiagramViewsUpdate, Prisma.InputJsonValue | null | undefined][]
  )
    .filter(
      (entry): entry is [keyof DiagramViewsUpdate, Prisma.InputJsonValue | null] =>
        entry[1] !== undefined
    )
    .map(([key, value]) => {
      const view = VIEW_KEY_TO_ENUM[key];
      if (value === null) {
        return prisma.treatmentItemDiagram.deleteMany({ where: { treatmentItemId, view } });
      }
      return prisma.treatmentItemDiagram.upsert({
        where: { treatmentItemId_view: { treatmentItemId, view } },
        create: { treatmentItemId, view, data: value },
        update: { data: value },
      });
    });

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
  return getTreatmentItemDiagrams(treatmentItemId);
}

export async function listTreatmentItemsByType(patientId: string, treatmentTypeId: string) {
  const items = await prisma.treatmentItem.findMany({
    where: { treatmentTypeId, treatment: { patientId } },
    include: { treatment: { select: { fecha: true } } },
    orderBy: { treatment: { fecha: 'desc' } },
  });
  return items.map((item) => ({ id: item.id, fecha: item.treatment.fecha }));
}
