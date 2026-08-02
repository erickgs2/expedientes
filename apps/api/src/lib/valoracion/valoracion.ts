import type { DiagramView, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export interface ValoracionUpdateData {
  fecha?: Date;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  notas?: string | null;
}

export async function listValoraciones(patientId: string) {
  return prisma.valoracion.findMany({
    where: { patientId },
    orderBy: { fecha: 'desc' },
  });
}

// `fecha` is optional: passing `undefined` lets Prisma fall back to the schema's `@default(now())`
// as a safety net. Callers that know the clinic's local calendar day (the route below) always
// supply it, since `now()` is a UTC instant that can land on the next calendar day.
export async function createValoracion(patientId: string, fecha?: Date) {
  return prisma.valoracion.create({ data: { patientId, fecha } });
}

export async function getValoracion(id: string) {
  return prisma.valoracion.findUnique({
    where: { id },
    include: { diagrams: true },
  });
}

export async function updateValoracion(id: string, data: ValoracionUpdateData) {
  return prisma.valoracion.update({ where: { id }, data });
}

const VIEW_KEY_TO_ENUM: Record<string, DiagramView> = {
  front: 'FRONT',
  leftProfile: 'LEFT_PROFILE',
  rightProfile: 'RIGHT_PROFILE',
};

export interface DiagramViewsUpdate {
  front?: Prisma.InputJsonValue | null;
  leftProfile?: Prisma.InputJsonValue | null;
  rightProfile?: Prisma.InputJsonValue | null;
}

/**
 * Upserts or clears whichever views are present in `views`. A key mapped to `null` deletes that
 * view's row (if any); an omitted key is left untouched — same null-means-clear,
 * omitted-means-unchanged rule this project uses for individual text fields, applied here to whole
 * per-view records. All writes run in one transaction.
 */
export async function updateValoracionDiagrams(id: string, views: DiagramViewsUpdate) {
  const operations = (Object.entries(views) as [keyof DiagramViewsUpdate, Prisma.InputJsonValue | null | undefined][])
    .filter(
      (entry): entry is [keyof DiagramViewsUpdate, Prisma.InputJsonValue | null] =>
        entry[1] !== undefined
    )
    .map(([key, value]) => {
      const view = VIEW_KEY_TO_ENUM[key];
      if (value === null) {
        return prisma.valoracionDiagram.deleteMany({ where: { valoracionId: id, view } });
      }
      return prisma.valoracionDiagram.upsert({
        where: { valoracionId_view: { valoracionId: id, view } },
        create: { valoracionId: id, view, data: value },
        update: { data: value },
      });
    });

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
  return getValoracion(id);
}
