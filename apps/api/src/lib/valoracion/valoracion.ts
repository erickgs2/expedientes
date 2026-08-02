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
  return prisma.valoracion.findUnique({ where: { id } });
}

export async function updateValoracion(id: string, data: ValoracionUpdateData) {
  return prisma.valoracion.update({ where: { id }, data });
}
