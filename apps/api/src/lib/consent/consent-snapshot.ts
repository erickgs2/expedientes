import type { Prisma } from '@prisma/client';
import type { ConsentSection } from '@expedientes/shared-types';
import { interpolate } from './build-consent-document';

export interface ConsentSnapshotSettings {
  clinicName: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
}

export interface ConsentSnapshotInput {
  settings: ConsentSnapshotSettings;
  patientName: string;
  patientIdentification: string;
  place: string;
  /** Calendar date in `YYYY-MM-DD`. */
  signedDate: string;
  witnessName: string | null;
  sections: ConsentSection[];
}

/**
 * Every value that prints on a signed consent, frozen at signing time so later edits to the clinic
 * settings or the catalog never alter it. Shared by digital signing and paper-scan registration —
 * the two differ only in how the signature itself is evidenced, never in what the letter says.
 */
export function buildConsentSnapshot(input: ConsentSnapshotInput) {
  const { settings } = input;
  const values = {
    clinicName: settings.clinicName,
    doctorTitle: settings.doctorTitle,
    doctorName: settings.doctorName,
    doctorLicense: settings.doctorLicense,
    patientName: input.patientName,
  };
  return {
    place: input.place,
    signedDateSnapshot: input.signedDate,
    patientNameSnapshot: input.patientName,
    patientIdentification: input.patientIdentification,
    clinicNameSnapshot: settings.clinicName,
    doctorTitleSnapshot: settings.doctorTitle,
    doctorNameSnapshot: settings.doctorName,
    doctorLicenseSnapshot: settings.doctorLicense,
    declarationBeforeSnapshot: interpolate(settings.declarationBefore, values),
    declarationAfterSnapshot: interpolate(settings.declarationAfter, values),
    // `ConsentSection` is `{ key, body }` — plain JSON, safe to hand to a Json column.
    sections: input.sections as unknown as Prisma.InputJsonValue,
    witnessName: input.witnessName,
  } satisfies Omit<
    Prisma.ConsentUncheckedCreateInput,
    | 'treatmentItemId'
    | 'signatureMethod'
    | 'scanId'
    | 'patientSignatureImagePath'
    | 'witnessSignatureImagePath'
  >;
}
