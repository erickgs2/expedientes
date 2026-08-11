export interface TreatmentProductRecord {
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
}
