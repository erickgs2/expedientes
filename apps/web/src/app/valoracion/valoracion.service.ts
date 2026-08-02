import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Valoracion, ValoracionUpdateInput } from '@expedientes/shared-types';

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
      this.http.post<{ valoracion: Valoracion }>(`/api/patients/${patientId}/valoracion`, {})
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
