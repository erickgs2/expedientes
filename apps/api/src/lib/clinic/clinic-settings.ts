import { prisma } from '../prisma/client';

/**
 * The clinic identity is a single row. Every read and write targets this id, so the application
 * cannot create a second one — the "there is exactly one clinic identity" invariant lives here and
 * in the schema's `@default("singleton")`, not in a uniqueness constraint that could be bypassed.
 */
export const CLINIC_SETTINGS_ID = 'singleton';

export interface ClinicSettingsUpdate {
  clinicName?: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
  doctorSignaturePath?: string;
  clinicLogoPath?: string;
}

export function getClinicSettings() {
  return prisma.clinicSettings.findUnique({ where: { id: CLINIC_SETTINGS_ID } });
}

export function upsertClinicSettings(data: ClinicSettingsUpdate) {
  return prisma.clinicSettings.upsert({
    where: { id: CLINIC_SETTINGS_ID },
    update: data,
    // `clinicName` is optional on the way in (the settings screen no longer edits it — the export's
    // letterhead is the uploaded logo) but the column is non-null, so a first-ever create needs a
    // value. An update simply omits it and keeps whatever is stored.
    create: { id: CLINIC_SETTINGS_ID, ...data, clinicName: data.clinicName ?? '' },
  });
}

/**
 * A consent must never be signed without the physician's identity — that omission is precisely the
 * defect the structured consent exists to fix, so both the API and the UI gate on this.
 */
export function hasUsableDoctorIdentity(
  settings: { doctorName: string; doctorLicense: string } | null
): boolean {
  return Boolean(settings && settings.doctorName.trim() && settings.doctorLicense.trim());
}
