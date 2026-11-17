import { currentClinicIdOrNull } from '../tenancy/context';

/**
 * Adds `delta` bytes (negative when a file is deleted) to the storage the current clinic uses.
 * Called by file storage on every write and delete. Outside a clinic context there is no clinic to
 * charge and nothing happens.
 *
 * The counter never goes below zero, and a full recount (storage-usage.ts) corrects any drift, so a
 * failed update is logged rather than failing the upload that triggered it.
 */
export async function addClinicStorageBytes(delta: number): Promise<void> {
  const clinicId = currentClinicIdOrNull();
  if (!clinicId || !delta) return;
  try {
    // Loaded on first use: file storage imports this module, and code that only reads or writes
    // files (thumbnails, tests) should not have to construct a database client.
    const { prismaUnscoped } = await import('../prisma/client');
    await prismaUnscoped.$executeRaw`
      UPDATE "Clinic"
      SET "storageBytes" = GREATEST(0, "storageBytes" + ${BigInt(Math.round(delta))})
      WHERE "id" = ${clinicId}`;
  } catch (error) {
    console.error('Could not update clinic storage usage', error);
  }
}
