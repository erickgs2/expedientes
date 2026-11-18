import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CreatePatientRequest,
  PatientPreview,
  PatientPurgeStatus,
  PatientSummary,
  PatientSummaryStats,
  PatientTimeline,
  RecentPatient,
} from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);

  search(query: string): Promise<PatientSummary[]> {
    return this.searchList(query).then((r) => r.patients);
  }

  /**
   * Active patients, or with `archived` the archived ones only. An active search also says how many
   * archived patients match, so the screen can point to them.
   */
  searchList(query: string, options: { archived?: boolean } = {}): Promise<{ patients: PatientSummary[]; archivedMatches: number }> {
    const params: Record<string, string> = { q: query };
    if (options.archived) params['archived'] = '1';
    return firstValueFrom(
      this.http.get<{ patients: PatientSummary[]; archivedMatches?: number }>('/api/patients', { params })
    ).then((r) => ({ patients: r.patients, archivedMatches: r.archivedMatches ?? 0 }));
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

  /**
   * Archives the patient (NOM-004-SSA3-2012 5.4: nothing is deleted). The record leaves the work
   * lists, reads read-only and can be restored; future appointments are cancelled.
   */
  archive(patientId: string, reason: string): Promise<{ cancelledAppointments: number }> {
    return firstValueFrom(
      this.http.delete<{ cancelledAppointments: number }>(`/api/patients/${patientId}`, { body: { reason } })
    );
  }

  restore(patientId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/patients/${patientId}/restore`, {}));
  }

  purgeStatus(patientId: string): Promise<PatientPurgeStatus> {
    return firstValueFrom(this.http.get<PatientPurgeStatus>(`/api/patients/${patientId}/purge`));
  }

  /** Owner only, five years after the last care; `confirmName` must repeat the full name. */
  purge(patientId: string, confirmName: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/patients/${patientId}/purge`, { confirmName }));
  }
}
