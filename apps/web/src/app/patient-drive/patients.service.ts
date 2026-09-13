import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CreatePatientRequest,
  PatientSummary,
  PatientSummaryStats,
} from '@expedientes/shared-types';

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

  getSummary(patientId: string): Promise<PatientSummaryStats> {
    return firstValueFrom(
      this.http.get<{ summary: PatientSummaryStats }>(`/api/patients/${patientId}/summary`)
    ).then((r) => r.summary);
  }

  /**
   * Corrects fields on the patient record itself. Each is optional and independent: omit one and
   * its stored value is left alone. An empty `documentId` clears the stored CURP; an empty `phone`
   * is rejected by the server, since the number drives WhatsApp appointment reminders.
   */
  updateDetails(
    patientId: string,
    changes: { documentId?: string; phone?: string }
  ): Promise<PatientSummary> {
    return firstValueFrom(
      this.http.patch<{ patient: PatientSummary }>(`/api/patients/${patientId}`, changes)
    ).then((r) => r.patient);
  }

  create(input: CreatePatientRequest): Promise<PatientSummary> {
    return firstValueFrom(
      this.http.post<{ patient: PatientSummary }>('/api/patients', input)
    ).then((r) => r.patient);
  }
}
