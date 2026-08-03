import type { PhotoTag } from '@prisma/client';
import { prisma } from '../prisma/client';

export async function listTreatmentItemPhotos(treatmentItemId: string) {
  return prisma.treatmentItemPhoto.findMany({
    where: { treatmentItemId },
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
    where: { patientId },
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

/**
 * Deletes a photo only if it actually belongs to `treatmentItemId` — same atomic
 * ownership-check-and-delete pattern as the Valoración photo lib's `deletePhoto`.
 */
export async function deleteTreatmentItemPhoto(
  treatmentItemId: string,
  photoId: string
): Promise<boolean> {
  const result = await prisma.treatmentItemPhoto.deleteMany({
    where: { id: photoId, treatmentItemId },
  });
  return result.count > 0;
}
