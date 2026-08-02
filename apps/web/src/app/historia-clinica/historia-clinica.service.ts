import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  AllergyOption,
  HistoriaClinica,
  HistoriaClinicaInput,
} from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class HistoriaClinicaService {
  private readonly http = inject(HttpClient);

  async get(patientId: string): Promise<HistoriaClinica | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ historiaClinica: HistoriaClinica }>(
          `/api/patients/${patientId}/historia-clinica`
        )
      );
      return response.historiaClinica;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return null;
      throw error;
    }
  }

  create(patientId: string, input: HistoriaClinicaInput): Promise<HistoriaClinica> {
    return firstValueFrom(
      this.http.post<{ historiaClinica: HistoriaClinica }>(
        `/api/patients/${patientId}/historia-clinica`,
        input
      )
    ).then((r) => r.historiaClinica);
  }

  update(patientId: string, input: HistoriaClinicaInput): Promise<HistoriaClinica> {
    return firstValueFrom(
      this.http.patch<{ historiaClinica: HistoriaClinica }>(
        `/api/patients/${patientId}/historia-clinica`,
        input
      )
    ).then((r) => r.historiaClinica);
  }

  searchAllergies(query: string): Promise<AllergyOption[]> {
    return firstValueFrom(
      this.http.get<{ allergies: AllergyOption[] }>('/api/allergies', { params: { q: query } })
    ).then((r) => r.allergies);
  }
}
