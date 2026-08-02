import { Injectable, signal } from '@angular/core';
import type { PatientSummary } from '@expedientes/shared-types';

const STORAGE_KEY = 'expedientes-active-patient-id';

function readStoredId(): string | null {
  // Guarded for non-browser execution (SSR/prerender, unit tests), where `sessionStorage` is absent.
  return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(STORAGE_KEY);
}

@Injectable({ providedIn: 'root' })
export class ActivePatientStore {
  readonly patient = signal<PatientSummary | null>(null);

  /**
   * The patient id left behind by an earlier page load in this browser session, if any. Only the
   * id is persisted, never the record itself — `activePatientGuard` re-fetches it so a reload
   * never resurrects stale patient data.
   */
  readonly restoredPatientId = signal<string | null>(readStoredId());

  select(patient: PatientSummary): void {
    this.patient.set(patient);
    this.restoredPatientId.set(patient.id);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, patient.id);
    }
  }

  clear(): void {
    this.patient.set(null);
    this.restoredPatientId.set(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
}
