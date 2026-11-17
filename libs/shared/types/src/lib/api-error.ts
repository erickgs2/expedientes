export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Machine-readable specifics for some codes, e.g. PlanLimitDetails for PLAN_LIMIT. */
    details?: unknown;
  };
}
