import type { PhotoTag } from '@prisma/client';
import { prisma } from '../prisma/client';

export async function getValoracionPatientId(valoracionId: string): Promise<string | null> {
  const valoracion = await prisma.valoracion.findUnique({
    where: { id: valoracionId },
    select: { patientId: true },
  });
  return valoracion?.patientId ?? null;
}

/** The valoración's gallery; `archived: true` lists the photos retired from it instead. */
export async function listPhotos(valoracionId: string, options: { archived?: boolean } = {}) {
  return prisma.photo.findMany({
    where: { valoracionId, archivedAt: options.archived ? { not: null } : null },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listPatientPhotos(patientId: string) {
  return prisma.photo.findMany({
    where: { patientId, archivedAt: null },
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
 * Retires a photo from the valoración's gallery instead of deleting it (NOM-004-SSA3-2012 5.4 and
 * 5.11: a clinical record is kept whole). The file stays where it is and still counts toward the
 * clinic's storage. Scoped by both ids, so a photo id cannot be retired through someone else's
 * valoración. Returns false when no active photo matched.
 */
export async function retirePhoto(valoracionId: string, photoId: string, userId: string): Promise<boolean> {
  const result = await prisma.photo.updateMany({
    where: { id: photoId, valoracionId, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: userId },
  });
  return result.count > 0;
}

/** Puts a retired photo back in the gallery. Returns false when no retired photo matched. */
export async function restorePhoto(valoracionId: string, photoId: string): Promise<boolean> {
  const result = await prisma.photo.updateMany({
    where: { id: photoId, valoracionId, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  });
  return result.count > 0;
}

/** Adds who retired each photo, by name, for the "retired photos" list. */
export async function withArchiverNames<T extends { archivedById: string | null }>(
  photos: T[]
): Promise<(T & { archivedByName: string | null })[]> {
  const ids = [...new Set(photos.map((p) => p.archivedById).filter((id): id is string => !!id))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return photos.map((p) => ({ ...p, archivedByName: p.archivedById ? names.get(p.archivedById) ?? null : null }));
}
