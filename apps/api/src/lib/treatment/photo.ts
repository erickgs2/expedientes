import type { PhotoTag } from '@prisma/client';
import { prisma } from '../prisma/client';

/** The item's gallery; `archived: true` lists the photos retired from it instead. */
export async function listTreatmentItemPhotos(treatmentItemId: string, options: { archived?: boolean } = {}) {
  return prisma.treatmentItemPhoto.findMany({
    where: { treatmentItemId, archivedAt: options.archived ? { not: null } : null },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Lists a patient's treatment-sourced photos for the merged timeline, with each photo's owning
 * item's treatment type name and parent visit's date denormalized on — the timeline groups and
 * labels these without a second request.
 */
export async function listPatientTreatmentPhotos(patientId: string) {
  const photos = await prisma.treatmentItemPhoto.findMany({
    where: { patientId, archivedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { treatmentItem: { include: { treatmentType: true, treatment: true } } },
  });
  return photos.map((photo) => ({
    id: photo.id,
    treatmentItemId: photo.treatmentItemId,
    patientId: photo.patientId,
    tag: photo.tag,
    filePath: photo.filePath,
    createdAt: photo.createdAt,
    treatmentTypeName: photo.treatmentItem.treatmentType.name,
    fecha: photo.treatmentItem.treatment.fecha,
  }));
}

export async function createTreatmentItemPhoto(
  treatmentItemId: string,
  patientId: string,
  tag: PhotoTag,
  filePath: string
) {
  return prisma.treatmentItemPhoto.create({
    data: { treatmentItemId, patientId, tag, filePath },
  });
}

/** Retires a treatment photo instead of deleting it; same rules as the valoración photo lib's `retirePhoto`. */
export async function retireTreatmentItemPhoto(
  treatmentItemId: string,
  photoId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.treatmentItemPhoto.updateMany({
    where: { id: photoId, treatmentItemId, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: userId },
  });
  return result.count > 0;
}

export async function restoreTreatmentItemPhoto(treatmentItemId: string, photoId: string): Promise<boolean> {
  const result = await prisma.treatmentItemPhoto.updateMany({
    where: { id: photoId, treatmentItemId, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  });
  return result.count > 0;
}
