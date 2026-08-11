export interface ClinicSettings {
  clinicName: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  doctorSignaturePath: string | null;
  declarationBefore: string;
  declarationAfter: string;
  updatedAt: string;
}

export interface ClinicSettingsInput {
  clinicName: string;
  defaultPlace: string;
  doctorTitle: string;
  doctorName: string;
  doctorLicense: string;
  declarationBefore: string;
  declarationAfter: string;
}
