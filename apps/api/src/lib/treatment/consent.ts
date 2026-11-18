import type { ConsentBlock, ConsentSection } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { readStoredFile, saveFile } from '../storage/file-storage';
import { getClinicSettings, hasUsableDoctorIdentity } from '../clinic/clinic-settings';
import { buildConsentDocument, localSigningDate } from '../consent/build-consent-document';
import { buildConsentSnapshot } from '../consent/consent-snapshot';
import { CONSENT_CONTINGENCY_CLAUSE, CONSENT_LABELS } from '../consent/consent-labels';

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

/** The fields of a signed Consent row that the printed letter is rebuilt from. */
export interface ConsentSnapshotRow {
  clinicNameSnapshot: string;
  doctorTitleSnapshot: string;
  doctorNameSnapshot: string;
  doctorLicenseSnapshot: string;
  patientNameSnapshot: string;
  patientIdentification: string;
  place: string;
  signedDateSnapshot: string;
  declarationBeforeSnapshot: string;
  declarationAfterSnapshot: string;
  sections: unknown;
  witnessName: string | null;
  secondWitnessName: string | null;
  contingencyClauseSnapshot: string | null;
}

/**
 * A signed letter, rebuilt entirely from its frozen snapshot — never from the live catalog or
 * settings. Letters signed before the second witness or the contingencies clause existed print
 * without them, exactly as they were signed.
 */
export function consentDocumentFromSnapshot(consent: ConsentSnapshotRow): ConsentBlock[] {
  return buildConsentDocument({
    clinicName: consent.clinicNameSnapshot,
    doctorTitle: consent.doctorTitleSnapshot,
    doctorName: consent.doctorNameSnapshot,
    doctorLicense: consent.doctorLicenseSnapshot,
    patientName: consent.patientNameSnapshot,
    patientIdentification: consent.patientIdentification,
    place: consent.place,
    signedDate: consent.signedDateSnapshot,
    declarationBefore: consent.declarationBeforeSnapshot,
    declarationAfter: consent.declarationAfterSnapshot,
    sections: consent.sections as ConsentSection[],
    witnessName: consent.witnessName,
    secondWitnessName: consent.secondWitnessName,
    contingencyClause: consent.contingencyClauseSnapshot,
    labels: CONSENT_LABELS.es,
  });
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
          contingencyClause: CONSENT_CONTINGENCY_CLAUSE,
          labels: CONSENT_LABELS.es,
        })
      : null;

  // Document: built entirely from the frozen snapshot columns, never from the live catalog/settings
  // — the declarations were already interpolated at signing time, so `interpolate` finds nothing
  // left to replace here.
  const consentDocument: ConsentBlock[] | null = item.consent
    ? consentDocumentFromSnapshot(item.consent)
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
          secondWitnessName: item.consent.secondWitnessName,
          secondWitnessSignatureImagePath: item.consent.secondWitnessSignatureImagePath,
          signedDateSnapshot: item.consent.signedDateSnapshot,
          signedAt: item.consent.signedAt,
        }
      : null,
    consentTemplateUpdatedAt: item.treatmentType.updatedAt,
    settingsUpdatedAt: settings?.updatedAt ?? null,
    defaultPlace: settings?.defaultPlace ?? '',
    defaultSecondWitness: settings?.secondWitnessName?.trim()
      ? { name: settings.secondWitnessName.trim(), hasSignature: !!settings.secondWitnessSignaturePath }
      : null,
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
  patientSignature: Buffer;
  /**
   * Witnesses are optional: the clinic decides whether a consent carries them. Each one present
   * has a name and a signature (the route refuses half a witness).
   */
  witness: { name: string; signature: Buffer } | null;
  /** `signature: null` uses the clinic's stored second-witness signature. */
  secondWitness: { name: string; signature: Buffer | null } | null;
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
  const witnessSignatureImagePath = input.witness
    ? await saveFile(input.witness.signature, 'consents', patientId, 'witness.jpg')
    : null;

  // The clinic's stored second-witness signature is copied onto the consent, never referenced: a
  // later change in the settings must not alter a letter that was already signed.
  let secondWitnessSignatureImagePath: string | null = null;
  if (input.secondWitness) {
    let secondWitnessSignature = input.secondWitness.signature;
    if (!secondWitnessSignature) {
      if (!settings.secondWitnessSignaturePath) return 'NO_SECOND_WITNESS_SIGNATURE' as const;
      secondWitnessSignature = await readStoredFile(settings.secondWitnessSignaturePath);
    }
    secondWitnessSignatureImagePath = await saveFile(secondWitnessSignature, 'consents', patientId, 'witness-2.jpg');
  }

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
        witnessName: input.witness?.name ?? null,
        secondWitnessName: input.secondWitness?.name ?? null,
        sections: sectionsFromTreatmentType(item.treatmentType),
      }),
      patientSignatureImagePath,
      witnessSignatureImagePath,
      secondWitnessSignatureImagePath,
    },
  });
  return { consent, patientId };
}
