import type { ClinicPlanSummary } from './plan.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  language: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  /** The clinic this session acts for. */
  clinic: { id: string; name: string };
  /** True for the clinic's owner, who keeps access when the plan drops to Free. */
  isOwner: boolean;
  /** The clinic's effective plan, so the web can hide what the plan does not include. */
  plan: ClinicPlanSummary;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}
