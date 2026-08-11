import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TreatmentType, TreatmentTypeUpdateInput } from '@expedientes/shared-types';

export interface TreatmentTypeConsentSections {
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
}

@Injectable({ providedIn: 'root' })
export class TreatmentTypesService {
  private readonly http = inject(HttpClient);

  list(): Promise<TreatmentType[]> {
    return firstValueFrom(
      this.http.get<{ treatmentTypes: TreatmentType[] }>('/api/treatment-types')
    ).then((r) => r.treatmentTypes);
  }

  create(name: string, sections: TreatmentTypeConsentSections): Promise<TreatmentType> {
    return firstValueFrom(
      this.http.post<{ treatmentType: TreatmentType }>('/api/treatment-types', {
        name,
        ...sections,
      })
    ).then((r) => r.treatmentType);
  }

  update(id: string, input: TreatmentTypeUpdateInput): Promise<TreatmentType> {
    return firstValueFrom(
      this.http.patch<{ treatmentType: TreatmentType }>(`/api/treatment-types/${id}`, input)
    ).then((r) => r.treatmentType);
  }
}
