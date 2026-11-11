import { prisma } from '../prisma/client';
import { saveFile, deleteStoredFile } from '../storage/file-storage';
import { getClinicSettings, hasUsableDoctorIdentity } from '../clinic/clinic-settings';
import { buildConsentSnapshot } from '../consent/consent-snapshot';
import { validateScanItemIds, type ScanPage } from '../consent/scan-validation';
import { sectionsFromTreatmentType } from './consent';

export type RegisterPaperResult =
  | 'NOT_FOUND'
  | 'NO_CLINIC_IDENTITY'
  | { error: 'NOT_IN_TREATMENT' | 'ALREADY_SIGNED' | 'INVALID_INPUT'; message: string }
  | { scanId: string; patientId: string; consentIds: string[] };

export interface RegisterPaperInput {
  itemIds: string[];
  /** Calendar date in `YYYY-MM-DD`, already validated by the route. */
  signedDate: string;
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  pages: ScanPage[];
}

/**
 * Registers one scan as the signature evidence of several consents from the same visit. Pages are
 * stored first, then the scan and every `PAPER` consent are created in one transaction; if that
 * transaction fails the just-stored pages are removed so no orphan file outlives a failed request.
 * `Consent.treatmentItemId @unique` still arbitrates a concurrent double registration (P2002 → 409
 * in `withApiErrors`).
 */
export async function registerPaperConsents(
  treatmentId: string,
  input: RegisterPaperInput
): Promise<RegisterPaperResult> {
  const treatment = await prisma.treatment.findUnique({
    where: { id: treatmentId },
    include: { patient: true, items: { include: { treatmentType: true, consent: true } } },
  });
  if (!treatment) return 'NOT_FOUND';

  const settings = await getClinicSettings();
  if (!settings || !hasUsableDoctorIdentity(settings)) return 'NO_CLINIC_IDENTITY';

  const check = validateScanItemIds(
    input.itemIds,
    treatment.items.map((i) => i.id),
    treatment.items.filter((i) => i.consent).map((i) => i.id)
  );
  if (!check.ok) return { error: check.code, message: check.message };

  const patientId = treatment.patientId;
  const storedPaths: string[] = [];
  try {
    for (let i = 0; i < input.pages.length; i++) {
      const page = input.pages[i];
      storedPaths.push(
        await saveFile(page.buffer, 'consent-scans', patientId, `page-${i + 1}.${page.extension}`)
      );
    }

    return await prisma.$transaction(async (tx) => {
      const scan = await tx.consentScan.create({
        data: {
          patientId,
          signedDate: input.signedDate,
          pages: { create: storedPaths.map((filePath, position) => ({ position, filePath })) },
        },
      });
      const consentIds: string[] = [];
      for (const itemId of input.itemIds) {
        const item = treatment.items.find((i) => i.id === itemId);
        if (!item) throw new Error(`Item ${itemId} vanished after validation`);
        const consent = await tx.consent.create({
          data: {
            treatmentItemId: itemId,
            signatureMethod: 'PAPER',
            scanId: scan.id,
            ...buildConsentSnapshot({
              settings,
              patientName: treatment.patient.fullName,
              patientIdentification: input.patientIdentification,
              place: input.place,
              signedDate: input.signedDate,
              witnessName: input.witnessName,
              sections: sectionsFromTreatmentType(item.treatmentType),
            }),
          },
        });
        consentIds.push(consent.id);
      }
      return { scanId: scan.id, patientId, consentIds };
    });
  } catch (error) {
    await Promise.all(
      storedPaths.map((path) =>
        deleteStoredFile(path).catch((e) =>
          console.error('orphan scan page cleanup failed', path, e)
        )
      )
    );
    throw error;
  }
}
