export interface ClinicSettings {
  clinicName: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  doctorSignaturePath: string | null;
  clinicLogoPath: string | null;
  declarationBefore: string;
  declarationAfter: string;
  whatsappPhoneNumberId: string | null;
  whatsappConfirmationTemplate: string | null;
  whatsappReminderTemplate: string | null;
  whatsappTemplateLanguage: string | null;
  /**
   * Whether an access token is stored. The token itself is write-only and never returned — a read
   * endpoint that echoed a credential would let anyone who can open the settings screen copy it.
   */
  whatsappAccessTokenSet: boolean;
  updatedAt: string;
}

export interface ClinicSettingsInput {
  defaultPlace: string;
  whatsappPhoneNumberId: string;
  whatsappConfirmationTemplate: string;
  whatsappReminderTemplate: string;
  whatsappTemplateLanguage: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
}
