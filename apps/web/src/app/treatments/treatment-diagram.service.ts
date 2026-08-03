import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { DiagramViewRecord, TreatmentItemDetail } from '@expedientes/shared-types';

export interface TreatmentItemReferenceOption {
  id: string;
  fecha: string;
}

@Injectable({ providedIn: 'root' })
export class TreatmentDiagramService {
  private readonly http = inject(HttpClient);

  getItem(itemId: string): Promise<TreatmentItemDetail> {
    return firstValueFrom(
      this.http.get<{ item: TreatmentItemDetail }>(`/api/treatment-items/${itemId}`)
    ).then((r) => r.item);
  }

  listSameTypeItems(
    patientId: string,
    treatmentTypeId: string
  ): Promise<TreatmentItemReferenceOption[]> {
    return firstValueFrom(
      this.http.get<{ items: TreatmentItemReferenceOption[] }>(
        `/api/patients/${patientId}/treatment-types/${treatmentTypeId}/items`
      )
    ).then((r) => r.items);
  }

  saveDiagrams(
    itemId: string,
    views: Record<string, Record<string, unknown> | null>
  ): Promise<DiagramViewRecord[]> {
    return firstValueFrom(
      this.http.patch<{ diagrams: DiagramViewRecord[] }>(
        `/api/treatment-items/${itemId}/diagram`,
        { views }
      )
    ).then((r) => r.diagrams);
  }
}
