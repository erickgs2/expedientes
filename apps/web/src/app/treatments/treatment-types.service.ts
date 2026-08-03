import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TreatmentType, TreatmentTypeUpdateInput } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class TreatmentTypesService {
  private readonly http = inject(HttpClient);

  list(): Promise<TreatmentType[]> {
    return firstValueFrom(
      this.http.get<{ treatmentTypes: TreatmentType[] }>('/api/treatment-types')
    ).then((r) => r.treatmentTypes);
  }

  create(name: string, consentTemplate: string): Promise<TreatmentType> {
    return firstValueFrom(
      this.http.post<{ treatmentType: TreatmentType }>('/api/treatment-types', {
        name,
        consentTemplate,
      })
    ).then((r) => r.treatmentType);
  }

  update(id: string, input: TreatmentTypeUpdateInput): Promise<TreatmentType> {
    return firstValueFrom(
      this.http.patch<{ treatmentType: TreatmentType }>(`/api/treatment-types/${id}`, input)
    ).then((r) => r.treatmentType);
  }
}
