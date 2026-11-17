export interface SignupConfig {
  /** Cloudflare Turnstile site key; null when the CAPTCHA is off. */
  turnstileSiteKey: string | null;
}

export interface SignupStartRequest {
  email: string;
  password: string;
  fullName: string;
  clinicName: string;
  phone: string;
  /** Ids of the legal versions the person read and accepted on the form. */
  privacyDocumentId: string;
  termsDocumentId: string;
  /** The optional box for promotions and surveys. */
  marketingConsent: boolean;
  turnstileToken?: string;
}

/** The same answer whether or not the email already has an account. */
export interface CodeSentResponse {
  /** Seconds until another code may be requested. */
  retryAfterSeconds: number;
}

export interface SignupVerifyRequest {
  email: string;
  code: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface InvitationInput {
  email: string;
  roleId: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

/** What the invitation link shows before accepting. */
export interface InvitationPreview {
  clinicName: string;
  email: string;
  roleName: string;
  inviterName: string;
  /** True when the email already has a MedCloud account: accepting asks for its password. */
  accountExists: boolean;
}

export interface AcceptInvitationRequest {
  /** New account only. */
  fullName?: string;
  /** New account: the password to set. Existing account: its current password. */
  password: string;
  privacyDocumentId: string;
  termsDocumentId: string;
  marketingConsent: boolean;
}
