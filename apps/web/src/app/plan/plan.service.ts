import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ClinicPlanDetails } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);

  /** The Stripe Checkout URL for buying Premium; the caller navigates to it. */
  checkout(interval: 'MONTH' | 'YEAR', method: 'CARD' | 'OXXO'): Promise<string> {
    return firstValueFrom(this.http.post<{ url: string }>('/api/billing/checkout', { interval, method })).then(
      (r) => r.url
    );
  }

  /** Stripe's customer portal (card, receipts, cancellation). */
  portal(): Promise<string> {
    return firstValueFrom(this.http.post<{ url: string }>('/api/billing/portal', {})).then((r) => r.url);
  }

  get(): Promise<ClinicPlanDetails> {
    return firstValueFrom(this.http.get<ClinicPlanDetails>('/api/clinic-plan'));
  }
}
