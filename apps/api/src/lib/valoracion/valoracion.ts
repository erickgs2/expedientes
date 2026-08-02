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
// `include: { diagrams: true }` on this single-record write keeps the response shape identical to
// `getValoracion`'s, so the shared `Valoracion` type is honest for the POST response too (a fresh
// Valoración simply gets `diagrams: []`). `listValoraciones` deliberately does *not* include them —
// it would ship a full diagram JSON blob per row for data nothing reads, hence `ValoracionSummary`.
export async function createValoracion(patientId: string, fecha?: Date) {
  return prisma.valoracion.create({
    data: { patientId, fecha },
    include: { diagrams: true },
  });
}

export async function getValoracion(id: string) {
  return prisma.valoracion.findUnique({
    where: { id },
    include: { diagrams: true },
  });
}

// Includes `diagrams` for the same reason as `createValoracion` above: one extra row's worth of a
// join on a single-record write, in exchange for the shared `Valoracion` type being accurate here.
export async function updateValoracion(id: string, data: ValoracionUpdateData) {
  return prisma.valoracion.update({
    where: { id },
    data,
    include: { diagrams: true },
  });
}

export interface DiagramViewsUpdate {
  front?: Prisma.InputJsonValue | null;
  leftProfile?: Prisma.InputJsonValue | null;
  rightProfile?: Prisma.InputJsonValue | null;
}

/**
 * Single source of truth for the accepted view keys: the `Record<keyof DiagramViewsUpdate, ...>`
 * type forces this literal to stay exhaustive over `DiagramViewsUpdate`, so adding a view to one
 * without the other is a compile error rather than a runtime `undefined`. That matters because an
 * `undefined` `view` would make `deleteMany`'s `where` degrade into "no view filter", silently
 * deleting every diagram for the Valoración. The route's request validation derives its key list
 * from this same object (`Object.keys`) so the two can never drift.
 */
export const VIEW_KEY_TO_ENUM: Record<keyof DiagramViewsUpdate, DiagramView> = {
  front: 'FRONT',
  leftProfile: 'LEFT_PROFILE',
  rightProfile: 'RIGHT_PROFILE',
};

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
