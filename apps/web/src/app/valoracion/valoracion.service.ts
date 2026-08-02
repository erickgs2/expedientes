import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Valoracion, ValoracionUpdateInput } from '@expedientes/shared-types';

/**
 * Today's date as a local `YYYY-MM-DD` string. Deliberately not `toISOString()`, which converts to
 * UTC and can report tomorrow's date for an evening visit in a negative-UTC-offset timezone.
 */
function todayLocalDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class ValoracionService {
  private readonly http = inject(HttpClient);

  list(patientId: string): Promise<Valoracion[]> {
    return firstValueFrom(
      this.http.get<{ valoraciones: Valoracion[] }>(`/api/patients/${patientId}/valoracion`)
    ).then((r) => r.valoraciones);
  }

  create(patientId: string): Promise<Valoracion> {
    return firstValueFrom(
      this.http.post<{ valoracion: Valoracion }>(`/api/patients/${patientId}/valoracion`, {
        fecha: todayLocalDateString(),
      })
    ).then((r) => r.valoracion);
  }

  get(id: string): Promise<Valoracion> {
    return firstValueFrom(
      this.http.get<{ valoracion: Valoracion }>(`/api/valoracion/${id}`)
    ).then((r) => r.valoracion);
  }

  update(id: string, input: ValoracionUpdateInput): Promise<Valoracion> {
    return firstValueFrom(
      this.http.patch<{ valoracion: Valoracion }>(`/api/valoracion/${id}`, input)
    ).then((r) => r.valoracion);
  }
}
