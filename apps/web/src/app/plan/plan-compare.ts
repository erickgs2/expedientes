import { PLAN_LIMITS } from '@expedientes/shared-types';
import { formatBytes } from './plan-format';

/** One line of the Free-vs-Premium comparison. A string is a quantity; a boolean, included or not. */
export interface PlanCompareRow {
  key: string;
  free: string | boolean;
  premium: string | boolean;
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The comparison, row by row, from the plan limits themselves so it can never drift from them. */
export function planCompareRows(t: Translate, lang: string): PlanCompareRow[] {
  const free = PLAN_LIMITS.FREE;
  const premium = PLAN_LIMITS.PREMIUM;
  const count = (value: number | null) => (value === null ? t('plan.unlimitedShort') : String(value));
  return [
    { key: 'users', free: count(free.users), premium: count(premium.users) },
    { key: 'treatmentTypes', free: count(free.treatmentTypes), premium: count(premium.treatmentTypes) },
    { key: 'storage', free: formatBytes(free.storageBytes, lang), premium: formatBytes(premium.storageBytes, lang) },
    { key: 'patients', free: t('plan.unlimitedShort'), premium: t('plan.unlimitedShort') },
    { key: 'pdf', free: true, premium: true },
    { key: 'whatsapp', free: free.features.whatsappReminders, premium: premium.features.whatsappReminders },
    { key: 'roles', free: free.features.customRoles, premium: premium.features.customRoles },
    { key: 'unbranded', free: free.features.unbrandedPdf, premium: premium.features.unbrandedPdf },
  ];
}
