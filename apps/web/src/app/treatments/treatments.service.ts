import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Treatment,
  TreatmentSummary,
  TreatmentItemsUpdateInput,
} from '@expedientes/shared-types';

/**
 * Today's date as a local `YYYY-MM-DD` string. Deliberately not `toISOString()`, which converts to
 * UTC and can report tomorrow's date for an evening visit in a negative-UTC-offset timezone —
 * matches `ValoracionService`'s identical helper.
 */
function todayLocalDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class TreatmentsService {
  private readonly http = inject(HttpClient);

  list(patientId: string): Promise<TreatmentSummary[]> {
    return firstValueFrom(
      this.http.get<{ treatments: TreatmentSummary[] }>(`/api/patients/${patientId}/treatments`)
    ).then((r) => r.treatments);
  }

  create(patientId: string): Promise<TreatmentSummary> {
    return firstValueFrom(
      this.http.post<{ treatment: TreatmentSummary }>(`/api/patients/${patientId}/treatments`, {
        fecha: todayLocalDateString(),
      })
    ).then((r) => r.treatment);
  }

  get(id: string): Promise<Treatment> {
    return firstValueFrom(
      this.http.get<{ treatment: Treatment }>(`/api/treatments/${id}`)
    ).then((r) => r.treatment);
  }

  updateItems(id: string, input: TreatmentItemsUpdateInput): Promise<Treatment> {
    return firstValueFrom(
      this.http.patch<{ treatment: Treatment }>(`/api/treatments/${id}/items`, input)
    ).then((r) => r.treatment);
  }
}
