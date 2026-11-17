import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CreatePatientRequest,
  PatientPreview,
  PatientSummary,
  PatientSummaryStats,
  PatientTimeline,
  RecentPatient,
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

  /** The search screen's preview pane: identity, counts, flags and the last treatment. */
  getPreview(patientId: string): Promise<PatientPreview> {
    return firstValueFrom(
      this.http.get<{ preview: PatientPreview }>(`/api/patients/${patientId}/preview`)
    ).then((r) => r.preview);
  }

  /** Appointments, valoraciones and treatments in one list, upcoming first then newest first. */
  getTimeline(patientId: string): Promise<PatientTimeline> {
    return firstValueFrom(
      this.http.get<{ timeline: PatientTimeline }>(`/api/patients/${patientId}/timeline`)
    ).then((r) => r.timeline);
  }

  /** Patients the current user opened most recently, newest first. */
  recent(): Promise<RecentPatient[]> {
    return firstValueFrom(
      this.http.get<{ patients: RecentPatient[] }>('/api/patients/recent')
    ).then((r) => r.patients);
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
    changes: { documentId?: string; phone?: string; contactPatientId?: string | null }
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

  /** Permanently deletes the patient and every record and file stored under them. */
  delete(patientId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/patients/${patientId}`));
  }
}
