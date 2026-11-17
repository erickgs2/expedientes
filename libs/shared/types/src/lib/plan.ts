/** A clinic's plan. Free is permanent; Premium comes from a paid subscription or a manual grant. */
export type PlanTier = 'FREE' | 'PREMIUM';

/** Capabilities that are on or off by plan. */
export type PlanFeature =
  /** WhatsApp appointment reminders and confirmations. */
  | 'whatsappReminders'
  /** Roles other than Admin. */
  | 'customRoles'
  /** Exported PDFs without the "Generado con MedCloud" footer. */
  | 'unbrandedPdf';

/** Quantities capped by plan. */
export type PlanQuota = 'users' | 'treatmentTypes' | 'storage';

export interface PlanLimits {
  /** Active users of the clinic; null is unlimited. */
  users: number | null;
  /** Active treatment types; null is unlimited. */
  treatmentTypes: number | null;
  /** Bytes of uploaded files. */
  storageBytes: number;
  features: Record<PlanFeature, boolean>;
}

const GIB = 1024 ** 3;

/**
 * What each plan allows. Lives in code, not the database: a change here is a product decision that
 * ships with the code that enforces it. The API enforces these; the web only uses them to explain.
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    users: 1,
    treatmentTypes: 5,
    storageBytes: 1 * GIB,
    features: { whatsappReminders: false, customRoles: false, unbrandedPdf: false },
  },
  PREMIUM: {
    users: null,
    treatmentTypes: null,
    storageBytes: 20 * GIB,
    features: { whatsappReminders: true, customRoles: true, unbrandedPdf: true },
  },
};

/** Where a clinic's Premium comes from. */
export type PlanSource = 'FREE' | 'SUBSCRIPTION' | 'GRANT';

export interface ClinicPlanSummary {
  tier: PlanTier;
  /** The subscription when one is paid up, else the grant, else FREE. */
  source: PlanSource;
  /** When Premium ends if nothing renews it (ISO). Null on Free. */
  premiumUntil: string | null;
  /** End of the current manual grant, if any (ISO). Shown alongside a subscription as courtesy. */
  grantEndsAt: string | null;
  features: Record<PlanFeature, boolean>;
}

export interface PlanPriceSummary {
  /** Centavos, IVA included. */
  monthlyCents: number;
  annualCents: number;
  annualDiscountPercent: number;
}

export interface ClinicPlanDetails extends ClinicPlanSummary {
  limits: PlanLimits;
  usage: { users: number; treatmentTypes: number; storageBytes: number };
  subscription: {
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
    interval: 'MONTH' | 'YEAR';
    method: 'CARD' | 'OXXO';
    currentPeriodEnd: string;
  } | null;
  price: PlanPriceSummary | null;
}

/** `error.details` of a 402 PLAN_LIMIT response. */
export interface PlanLimitDetails {
  limit: PlanQuota | PlanFeature;
  /** The cap that was hit; absent for an on/off feature. */
  max?: number;
  requiredPlan: 'PREMIUM';
}
