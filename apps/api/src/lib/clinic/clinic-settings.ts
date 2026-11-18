import { prisma } from '../prisma/client';
import { currentClinicId } from '../tenancy/context';

/**
 * The clinic identity: one row per clinic, keyed by clinicId. The scoped client limits every read and
 * write to the current clinic's row.
 */
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
  secondWitnessName?: string | null;
  secondWitnessSignaturePath?: string | null;
  whatsappAccessToken?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappConfirmationTemplate?: string | null;
  whatsappReminderTemplate?: string | null;
  whatsappTemplateLanguage?: string | null;
  whatsappNotificationsEnabled?: boolean;
}

/**
 * The settings as the API hands them out: identical to the stored row minus the WhatsApp access
 * token, which is write-only. A read endpoint must never echo a credential back — anyone who can
 * open the settings screen could otherwise copy the clinic's Meta token out of a network response.
 * `whatsappAccessTokenSet` tells the UI whether one is stored without revealing it.
 */
export function toPublicClinicSettings<T extends { whatsappAccessToken: string | null }>(
  settings: T
): Omit<T, 'whatsappAccessToken'> & { whatsappAccessTokenSet: boolean } {
  const { whatsappAccessToken, ...rest } = settings;
  return { ...rest, whatsappAccessTokenSet: Boolean(whatsappAccessToken?.trim()) };
}

export function getClinicSettings() {
  return prisma.clinicSettings.findUnique({ where: { clinicId: currentClinicId() } });
}

export function upsertClinicSettings(data: ClinicSettingsUpdate) {
  return prisma.clinicSettings.upsert({
    where: { clinicId: currentClinicId() },
    update: data,
    // `clinicName` is optional on the way in (the settings screen no longer edits it — the export's
    // letterhead is the uploaded logo) but the column is non-null, so a first-ever create needs a
    // value. An update simply omits it and keeps whatever is stored. The scoped client adds clinicId.
    create: { ...data, clinicName: data.clinicName ?? '' },
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
