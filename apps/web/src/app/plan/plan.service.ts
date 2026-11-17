import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ClinicPlanDetails } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);

  get(): Promise<ClinicPlanDetails> {
    return firstValueFrom(this.http.get<ClinicPlanDetails>('/api/clinic-plan'));
  }
}
