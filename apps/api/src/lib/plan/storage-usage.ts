import { prismaUnscoped } from '../prisma/client';
import { storedFileSize, THUMBNAIL_SUFFIX } from '../storage/file-storage';

/** Every stored path a clinic's rows point to: photos, scans, product photos, signatures, logo. */
async function clinicStoredPaths(clinicId: string): Promise<string[]> {
  const where = { clinicId };
  const [photos, itemPhotos, products, scanPages, consents, settings] = await Promise.all([
    prismaUnscoped.photo.findMany({ where, select: { filePath: true } }),
    prismaUnscoped.treatmentItemPhoto.findMany({ where, select: { filePath: true } }),
    prismaUnscoped.treatmentItemProduct.findMany({ where, select: { photoPath: true } }),
    prismaUnscoped.consentScanPage.findMany({ where: { scan: where }, select: { filePath: true } }),
    prismaUnscoped.consent.findMany({
      where,
      select: { patientSignatureImagePath: true, witnessSignatureImagePath: true },
    }),
    prismaUnscoped.clinicSettings.findUnique({
      where,
      select: { doctorSignaturePath: true, clinicLogoPath: true },
    }),
  ]);
  const paths = [
    ...photos.map((row) => row.filePath),
    ...itemPhotos.map((row) => row.filePath),
    ...products.map((row) => row.photoPath),
    ...scanPages.map((row) => row.filePath),
    ...consents.flatMap((row) => [row.patientSignatureImagePath, row.witnessSignatureImagePath]),
    settings?.doctorSignaturePath,
    settings?.clinicLogoPath,
  ];
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

/**
 * Recounts a clinic's storage from the files themselves (each file plus its thumbnail) and stores
 * the total. Run once for clinics that predate storage accounting, and whenever the running counter
 * needs correcting. A few files are measured at a time, so a large clinic does not flood the disk or
 * S3 with requests.
 */
export async function recountClinicStorage(clinicId: string): Promise<number> {
  const paths = await clinicStoredPaths(clinicId);
  let total = 0;
  const batch = 8;
  for (let i = 0; i < paths.length; i += batch) {
    const sizes = await Promise.all(
      paths
        .slice(i, i + batch)
        .flatMap((path) => [storedFileSize(path), storedFileSize(path + THUMBNAIL_SUFFIX)])
    );
    total += sizes.reduce((sum, size) => sum + size, 0);
  }
  await prismaUnscoped.clinic.update({
    where: { id: clinicId },
    data: { storageBytes: BigInt(total), storageCountedAt: new Date() },
  });
  return total;
}

/** Counts the storage of every clinic that has never been counted. Runs when the API starts. */
export async function recountUncountedClinics(): Promise<void> {
  const clinics = await prismaUnscoped.clinic.findMany({
    where: { storageCountedAt: null },
    select: { id: true },
  });
  for (const clinic of clinics) {
    try {
      await recountClinicStorage(clinic.id);
    } catch (error) {
      console.error(`Could not count storage for clinic ${clinic.id}`, error);
    }
  }
}
