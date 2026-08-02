import type { PhotoTag } from '@prisma/client';
import { prisma } from '../prisma/client';

export async function getValoracionPatientId(valoracionId: string): Promise<string | null> {
  const valoracion = await prisma.valoracion.findUnique({
    where: { id: valoracionId },
    select: { patientId: true },
  });
  return valoracion?.patientId ?? null;
}

export async function listPhotos(valoracionId: string) {
  return prisma.photo.findMany({
    where: { valoracionId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listPatientPhotos(patientId: string) {
  return prisma.photo.findMany({
    where: { patientId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createPhoto(
  valoracionId: string,
  patientId: string,
  tag: PhotoTag,
  filePath: string
) {
  return prisma.photo.create({
    data: { valoracionId, patientId, tag, filePath },
  });
}

/**
 * Deletes a photo only if it actually belongs to `valoracionId` — a bare `prisma.photo.delete({
 * where: { id: photoId } })` would delete by id alone, letting a caller pass any photo id
 * alongside an unrelated (even a different patient's) `valoracionId` in the URL. `deleteMany`
 * with both fields in `where` makes the ownership check and the delete a single atomic operation.
 */
export async function deletePhoto(valoracionId: string, photoId: string): Promise<boolean> {
  const result = await prisma.photo.deleteMany({
    where: { id: photoId, valoracionId },
  });
  return result.count > 0;
}
