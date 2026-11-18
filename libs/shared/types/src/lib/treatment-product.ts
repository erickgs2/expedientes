import type { ProductDose } from './clinical-fields.js';

export interface TreatmentProductRecord extends Partial<ProductDose> {
  id: string;
  brand: string;
  lotNumber: string;
  /** ISO timestamp at the last instant of the printed expiry month, or null. */
  expiryDate: string | null;
  photoPath: string | null;
  createdAt: string;
}

export interface TreatmentProductInput {
  brand: string;
  lotNumber: string;
  /** `YYYY-MM-DD`; the server normalizes it to the end of that month. Empty string clears it. */
  expiryDate: string;
  /** What was applied (NOM-004-SSA3-2012 6.2.6), all optional. */
  dose?: Partial<ProductDose>;
}
