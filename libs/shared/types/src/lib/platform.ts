import type { PlanSource, PlanTier } from './plan.js';
import type { LegalDocumentKind, LegalDocumentSummary } from './legal.js';

export interface PlatformAdminView {
  email: string;
  fullName: string;
}

/** Where the platform sign-in goes after the password. */
export interface PlatformLoginResponse {
  next: 'totp' | 'setup';
}

export interface PlatformTotpSetup {
  /** Base32, for typing into an authenticator app. */
  secret: string;
  otpauthUri: string;
}

export interface ServerMetricPoint {
  takenAt: string;
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
}

export interface ServerMetricsNow extends ServerMetricPoint {
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  dbSizeBytes: number;
  processRssBytes: number;
  uptimeSeconds: number;
}

export interface PlatformOverview {
  clinics: {
    total: number;
    active: number;
    suspended: number;
    new7d: number;
    new30d: number;
    free: number;
    premium: number;
    premiumPaid: number;
    premiumGranted: number;
  };
  /** Monthly recurring revenue in centavos, yearly plans counted as 1/12. */
  mrrCents: number;
  /** Share of clinics on paid Premium, 0–100. */
  paidConversionPercent: number;
  server: ServerMetricsNow | null;
  /** Last 24 hours, one point per 5 minutes. */
  series: ServerMetricPoint[];
}

export type ClinicListTab = 'all' | 'free' | 'premium';
export type ClinicListFilter = 'expiring7' | 'expiring30' | 'pastDue' | 'inactive30';

export interface PlatformClinicRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  ownerEmail: string | null;
  tier: PlanTier;
  source: PlanSource;
  /** CARD or OXXO for paid Premium. */
  paymentMethod: 'CARD' | 'OXXO' | null;
  interval: 'MONTH' | 'YEAR' | null;
  premiumUntil: string | null;
  users: number;
  patients: number;
  treatmentTypes: number;
  consents: number;
  storageBytes: number;
  lastActivityAt: string | null;
}

export interface PlatformClinicList {
  rows: PlatformClinicRow[];
  counts: Record<ClinicListTab, number>;
}

export interface PlatformGrantView {
  id: string;
  months: number;
  startsAt: string;
  endsAt: string;
  reason: string;
  grantedBy: string;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface PlatformPaymentView {
  id: string;
  type: string;
  amountCents: number | null;
  summary: string | null;
  receivedAt: string;
}

export interface PlatformClinicDetail extends PlatformClinicRow {
  phone: string | null;
  timeZone: string;
  grants: PlatformGrantView[];
  /** Stripe events for the clinic, newest first (payments, failures, vouchers). */
  payments: PlatformPaymentView[];
}

export interface GrantPremiumRequest {
  clinicIds: string[];
  months: number;
  /** "now", or right after the clinic's current Premium ends so periods do not overlap. */
  start: 'now' | 'afterCurrent';
  reason: string;
}

export interface GrantPremiumResult {
  granted: Array<{ clinicId: string; startsAt: string; endsAt: string }>;
}

export interface PlatformPriceVersion {
  id: string;
  monthlyCents: number;
  annualDiscountPercent: number;
  annualCents: number;
  effectiveFrom: string;
  createdBy: string;
  current: boolean;
}

export interface NewPriceRequest {
  monthlyCents: number;
  annualDiscountPercent: number;
}

export interface PlatformLegalVersion extends LegalDocumentSummary {
  requiresAcceptance: boolean;
  publishedBy: string;
  acceptedCount: number;
  current: boolean;
}

export interface PlatformLegalOverview {
  activeUsers: number;
  documents: Record<LegalDocumentKind, PlatformLegalVersion[]>;
}

export interface PublishLegalRequest {
  kind: LegalDocumentKind;
  version: string;
  body: string;
  changeSummary: string;
  /** ISO; now or later. */
  effectiveFrom: string;
  requiresAcceptance: boolean;
}

export interface PlatformAuditEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
}
