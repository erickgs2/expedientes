import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  AllergyOption,
  HistoriaClinica,
  HistoriaClinicaInput,
} from '@expedientes/shared-types';

/**
 * Marks a request whose 404 is an expected outcome the caller handles itself, so
 * `errorInterceptor` skips its snackbar for it. Needed because the interceptor sees every
 * response before the calling service's own try/catch does.
 */
export const SUPPRESS_404_TOAST = new HttpContextToken<boolean>(() => false);

@Injectable({ providedIn: 'root' })
export class HistoriaClinicaService {
  private readonly http = inject(HttpClient);

  /**
   * Returns `null` when the patient has no historia clínica yet — the normal first-visit case,
   * which the form renders as a blank record rather than an error.
   */
  async get(patientId: string): Promise<HistoriaClinica | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ historiaClinica: HistoriaClinica }>(
          `/api/patients/${patientId}/historia-clinica`,
          { context: new HttpContext().set(SUPPRESS_404_TOAST, true) }
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
