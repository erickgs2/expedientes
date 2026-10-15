import { prisma } from '../prisma/client';
import { deleteStoredFile } from '../storage/file-storage';

/**
 * Permanently removes a patient and everything recorded under them: clinical history, valoraciones
 * and their diagrams and photos, treatments with their consents, products and photos, and
 * appointments. The schema declares no cascade from `Patient` to those tables, so they are removed
 * explicitly, children first, in one transaction — either the whole record goes or none of it does.
 *
 * Uploaded files (photos, product labels, signatures) are removed only after the transaction
 * commits, so a failed delete never orphans database rows that point at missing files. A file that
 * fails to delete is logged and leaves an orphan on disk/S3, which is the safer failure: the
 * patient's rows are gone and the request has still succeeded.
 *
 * Audit entries are intentionally kept; `AuditLog` has no foreign key to `Patient`.
 *
 * Returns false when the patient does not exist.
 */
export async function deletePatient(patientId: string): Promise<boolean> {
  const filePaths = await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) return null;

    const itemWhere = { treatmentItem: { treatment: { patientId } } };
    const [valoracionPhotos, itemPhotos, products, consents] = await Promise.all([
      tx.photo.findMany({ where: { patientId }, select: { filePath: true } }),
      tx.treatmentItemPhoto.findMany({ where: { patientId }, select: { filePath: true } }),
      tx.treatmentItemProduct.findMany({
        where: { patientId, photoPath: { not: null } },
        select: { photoPath: true },
      }),
      tx.consent.findMany({
        where: itemWhere,
        select: { patientSignatureImagePath: true, witnessSignatureImagePath: true },
      }),
    ]);

    // TreatmentItem's diagrams, photos and products cascade; its consent does not.
    await tx.consent.deleteMany({ where: itemWhere });
    await tx.treatmentItem.deleteMany({ where: { treatment: { patientId } } });
    await tx.treatment.deleteMany({ where: { patientId } });

    await tx.photo.deleteMany({ where: { patientId } });
    await tx.valoracionDiagram.deleteMany({ where: { valoracion: { patientId } } });
    await tx.valoracion.deleteMany({ where: { patientId } });

    await tx.historiaClinica.deleteMany({ where: { patientId } });
    await tx.appointment.deleteMany({ where: { patientId } });
    await tx.patient.delete({ where: { id: patientId } });

    return [
      ...valoracionPhotos.map((p) => p.filePath),
      ...itemPhotos.map((p) => p.filePath),
      ...products.map((p) => p.photoPath),
      ...consents.flatMap((c) => [c.patientSignatureImagePath, c.witnessSignatureImagePath]),
    ].filter((path): path is string => !!path);
  });

  if (filePaths === null) return false;

  await Promise.all(
    filePaths.map((path) =>
      deleteStoredFile(path).catch((error) => console.error('stored file delete failed', path, error))
    )
  );
  return true;
}
