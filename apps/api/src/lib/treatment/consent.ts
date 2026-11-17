import type { ConsentBlock, ConsentSection } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { saveFile } from '../storage/file-storage';
import { getClinicSettings, hasUsableDoctorIdentity } from '../clinic/clinic-settings';
import { buildConsentDocument, localSigningDate } from '../consent/build-consent-document';
import { buildConsentSnapshot } from '../consent/consent-snapshot';
import { CONSENT_LABELS } from '../consent/consent-labels';

export function sectionsFromTreatmentType(type: {
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
}): ConsentSection[] {
  return [
    { key: 'description', body: type.consentDescription },
    { key: 'risks', body: type.consentRisks ?? '' },
    { key: 'alternatives', body: type.consentAlternatives ?? '' },
    { key: 'aftercare', body: type.consentAftercare ?? '' },
    { key: 'contraindications', body: type.consentContraindications ?? '' },
  ].filter((s) => s.body.trim()) as ConsentSection[];
}

export async function getTreatmentItemDetail(id: string) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id },
    include: {
      treatmentType: true,
      treatment: { include: { patient: true } },
      consent: { include: { scan: { include: { pages: { orderBy: { position: 'asc' } } } } } },
      diagrams: true,
    },
  });
  if (!item) return null;

  const settings = await getClinicSettings();
  const patient = item.treatment.patient;
  const canSign = hasUsableDoctorIdentity(settings);

  // Preview: the real values (place, signed date, patient identification, witness) are re-derived
  // at signing time and frozen onto the Consent row — this is only ever a live approximation shown
  // before anything is signed.
  const consentPreview: ConsentBlock[] | null =
    !item.consent && settings && canSign
      ? buildConsentDocument({
          clinicName: settings.clinicName,
          doctorTitle: settings.doctorTitle,
          doctorName: settings.doctorName,
          doctorLicense: settings.doctorLicense,
          patientName: patient.fullName,
          patientIdentification: patient.documentId ?? '',
          place: settings.defaultPlace,
          signedDate: localSigningDate(),
          declarationBefore: settings.declarationBefore,
          declarationAfter: settings.declarationAfter,
          sections: sectionsFromTreatmentType(item.treatmentType),
          witnessName: null,
          labels: CONSENT_LABELS.es,
        })
      : null;

  // Document: built entirely from the frozen snapshot columns, never from the live catalog/settings
  // — the declarations were already interpolated at signing time, so `interpolate` finds nothing
  // left to replace here.
  const consentDocument: ConsentBlock[] | null = item.consent
    ? buildConsentDocument({
        clinicName: item.consent.clinicNameSnapshot,
        doctorTitle: item.consent.doctorTitleSnapshot,
        doctorName: item.consent.doctorNameSnapshot,
        doctorLicense: item.consent.doctorLicenseSnapshot,
        patientName: item.consent.patientNameSnapshot,
        patientIdentification: item.consent.patientIdentification,
        place: item.consent.place,
        signedDate: item.consent.signedDateSnapshot,
        declarationBefore: item.consent.declarationBeforeSnapshot,
        declarationAfter: item.consent.declarationAfterSnapshot,
        sections: item.consent.sections as unknown as ConsentSection[],
        witnessName: item.consent.witnessName,
        labels: CONSENT_LABELS.es,
      })
    : null;

  return {
    id: item.id,
    treatmentId: item.treatmentId,
    treatmentTypeId: item.treatmentTypeId,
    treatmentTypeName: item.treatmentType.name,
    notes: item.notes,
    patientId: item.treatment.patientId,
    patientDocumentId: patient.documentId ?? '',
    patientName: patient.fullName,
    consentPreview,
    consentDocument,
    consent: item.consent
      ? {
          id: item.consent.id,
          signatureMethod: item.consent.signatureMethod,
          scanId: item.consent.scanId,
          scanPages: item.consent.scan?.pages.map((p) => p.filePath) ?? [],
          place: item.consent.place,
          patientIdentification: item.consent.patientIdentification,
          witnessName: item.consent.witnessName,
          patientSignatureImagePath: item.consent.patientSignatureImagePath,
          witnessSignatureImagePath: item.consent.witnessSignatureImagePath,
          signedDateSnapshot: item.consent.signedDateSnapshot,
          signedAt: item.consent.signedAt,
        }
      : null,
    consentTemplateUpdatedAt: item.treatmentType.updatedAt,
    settingsUpdatedAt: settings?.updatedAt ?? null,
    defaultPlace: settings?.defaultPlace ?? '',
    canSign,
    diagrams: item.diagrams.map((d) => ({
      view: d.view,
      data: d.data as Record<string, unknown>,
      updatedAt: d.updatedAt,
    })),
  };
}

export interface SignConsentInput {
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  patientSignature: Buffer;
  witnessSignature: Buffer | null;
}

/**
 * Signs a treatment item's consent: every value that ends up printed on the document — the clinic
 * identity, the declarations (already interpolated), the catalog sections, the place, and the
 * signed date — is snapshotted onto the new `Consent` row and never re-read live afterward. This is
 * what keeps a signed consent immutable even if the clinic settings or the catalog template are
 * edited later. The signed date is resolved via `localSigningDate()` (the server's local calendar
 * date, since the API runs at the clinic) and frozen into `signedDateSnapshot`; it is never
 * recomputed from `signedAt`, which remains only the audit timestamp. Stores the signature image(s)
 * via the same file-storage path photos use. `Consent.treatmentItemId` is `@unique`, so a concurrent
 * double-sign of the same item is caught by the database (mapped to 409 by `withApiErrors`'s
 * existing P2002 handling) even though the route already pre-checks for the common case.
 */
export async function signTreatmentItemConsent(treatmentItemId: string, input: SignConsentInput) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id: treatmentItemId },
    include: { treatmentType: true, treatment: { include: { patient: true } } },
  });
  if (!item) return null;

  const settings = await getClinicSettings();
  if (!settings || !hasUsableDoctorIdentity(settings)) return 'NO_CLINIC_IDENTITY' as const;

  const patientId = item.treatment.patientId;
  const patientName = item.treatment.patient.fullName;
  const patientSignatureImagePath = await saveFile(
    input.patientSignature,
    'consents',
    patientId,
    'signature.jpg'
  );
  const witnessSignatureImagePath = input.witnessSignature
    ? await saveFile(input.witnessSignature, 'consents', patientId, 'witness.jpg')
    : null;

  const consent = await prisma.consent.create({
    data: {
      treatmentItemId,
      signatureMethod: 'DIGITAL',
      ...buildConsentSnapshot({
        settings,
        patientName,
        patientIdentification: input.patientIdentification,
        place: input.place,
        signedDate: localSigningDate(),
        witnessName: input.witnessName,
        sections: sectionsFromTreatmentType(item.treatmentType),
      }),
      patientSignatureImagePath,
      witnessSignatureImagePath,
    },
  });
  return { consent, patientId };
}
