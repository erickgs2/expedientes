import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { CreatePatientRequest, PatientSummary } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);

  search(query: string): Promise<PatientSummary[]> {
    return firstValueFrom(
      this.http.get<{ patients: PatientSummary[] }>('/api/patients', { params: { q: query } })
    ).then((r) => r.patients);
  }

  getById(patientId: string): Promise<PatientSummary> {
    return firstValueFrom(
      this.http.get<{ patient: PatientSummary }>(`/api/patients/${patientId}`)
    ).then((r) => r.patient);
  }

  create(input: CreatePatientRequest): Promise<PatientSummary> {
    return firstValueFrom(
      this.http.post<{ patient: PatientSummary }>('/api/patients', input)
    ).then((r) => r.patient);
  }
}
