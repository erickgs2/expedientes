import { prisma } from '../prisma/client';
import { saveFile } from '../storage/file-storage';

export async function getTreatmentItemDetail(id: string) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id },
    include: { treatmentType: true, treatment: true, consent: true },
  });
  if (!item) return null;
  return {
    id: item.id,
    treatmentId: item.treatmentId,
    treatmentTypeId: item.treatmentTypeId,
    treatmentTypeName: item.treatmentType.name,
    notes: item.notes,
    patientId: item.treatment.patientId,
    consentTemplate: item.treatmentType.consentTemplate,
    consent: item.consent
      ? {
          id: item.consent.id,
          consentText: item.consent.consentText,
          signatureImagePath: item.consent.signatureImagePath,
          signedAt: item.consent.signedAt,
        }
      : null,
  };
}

/**
 * Signs a treatment item's consent: snapshots the treatment type's *current* `consentTemplate`
 * text onto the new `Consent` row (never re-read live afterward — this is what keeps a signed
 * consent immutable even if the catalog template is edited later), and stores the signature image
 * via the same file-storage path photos use. `Consent.treatmentItemId` is `@unique`, so a
 * concurrent double-sign of the same item is caught by the database (mapped to 409 by
 * `withApiErrors`'s existing P2002 handling) even though the route already pre-checks for the
 * common case.
 */
export async function signTreatmentItemConsent(treatmentItemId: string, signatureBuffer: Buffer) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id: treatmentItemId },
    include: { treatmentType: true, treatment: true },
  });
  if (!item) return null;

  const signatureImagePath = await saveFile(
    signatureBuffer,
    'consents',
    item.treatment.patientId,
    'signature.jpg'
  );
  const consent = await prisma.consent.create({
    data: {
      treatmentItemId,
      consentText: item.treatmentType.consentTemplate,
      signatureImagePath,
    },
  });
  return { consent, patientId: item.treatment.patientId };
}
