import type { HttpErrorResponse } from '@angular/common/http';

/** Code and details of an API error body, from a failed HttpClient call. */
export function apiErrorOf(error: unknown): { status: number; code: string; details?: Record<string, unknown> } {
  const response = error as Partial<HttpErrorResponse>;
  const body = response?.error?.error as { code?: string; details?: Record<string, unknown> } | undefined;
  return { status: response?.status ?? 0, code: body?.code ?? 'UNKNOWN', details: body?.details };
}
