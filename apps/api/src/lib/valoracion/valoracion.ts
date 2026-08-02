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

export async function createValoracion(patientId: string) {
  return prisma.valoracion.create({ data: { patientId } });
}

export async function getValoracion(id: string) {
  return prisma.valoracion.findUnique({ where: { id } });
}

export async function updateValoracion(id: string, data: ValoracionUpdateData) {
  return prisma.valoracion.update({ where: { id }, data });
}
