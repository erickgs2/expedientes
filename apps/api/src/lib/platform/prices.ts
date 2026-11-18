import type { NewPriceRequest, PlatformPriceVersion } from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';

/** OXXO vouchers go from 10 to 10,000 MXN, so both prices must stay payable there. */
export const MIN_MONTHLY_CENTS = 10_00;
export const MAX_ANNUAL_CENTS = 10_000_00;
export const MAX_DISCOUNT_PERCENT = 50;

/** monthly × 12 × (1 − discount), rounded to whole pesos. 150 MXN at 15% → 1,530 MXN. */
export function annualCentsFor(monthlyCents: number, discountPercent: number): number {
  const exact = (monthlyCents * 12 * (100 - discountPercent)) / 100;
  return Math.round(exact / 100) * 100;
}

export function validateNewPrice(input: Partial<NewPriceRequest>): {
  monthlyCents: number;
  annualDiscountPercent: number;
  annualCents: number;
} {
  const { monthlyCents, annualDiscountPercent } = input;
  if (!Number.isInteger(monthlyCents) || (monthlyCents as number) < MIN_MONTHLY_CENTS) {
    throw new ApiProblem('INVALID_INPUT', 'The monthly price must be at least 10 MXN', 400, { field: 'monthlyCents' });
  }
  if (
    !Number.isInteger(annualDiscountPercent) ||
    (annualDiscountPercent as number) < 0 ||
    (annualDiscountPercent as number) > MAX_DISCOUNT_PERCENT
  ) {
    throw new ApiProblem('INVALID_INPUT', 'The annual discount must be between 0% and 50%', 400, {
      field: 'annualDiscountPercent',
    });
  }
  const annualCents = annualCentsFor(monthlyCents as number, annualDiscountPercent as number);
  if (annualCents > MAX_ANNUAL_CENTS) {
    throw new ApiProblem('INVALID_INPUT', 'The annual price cannot exceed 10,000 MXN (OXXO limit)', 400, {
      field: 'monthlyCents',
    });
  }
  return { monthlyCents: monthlyCents as number, annualDiscountPercent: annualDiscountPercent as number, annualCents };
}

export async function listPriceVersions(now = new Date()): Promise<PlatformPriceVersion[]> {
  const rows = await prismaUnscoped.planPrice.findMany({ orderBy: { effectiveFrom: 'desc' } });
  const current = rows.find((row) => row.effectiveFrom <= now);
  return rows.map((row) => ({
    id: row.id,
    monthlyCents: row.monthlyCents,
    annualDiscountPercent: row.annualDiscountPercent,
    annualCents: row.annualCents,
    effectiveFrom: row.effectiveFrom.toISOString(),
    createdBy: row.createdBy,
    current: row.id === current?.id,
  }));
}

/**
 * Adds a price version, in force from now, for new purchases. Earlier versions are never edited so
 * past charges keep their price. Stripe prices are created with it once payments exist (phase 5).
 */
export async function createPriceVersion(input: Partial<NewPriceRequest>, adminEmail: string) {
  const price = validateNewPrice(input);
  return prismaUnscoped.planPrice.create({ data: { ...price, createdBy: adminEmail } });
}
