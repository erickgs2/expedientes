import { Injectable, signal } from '@angular/core';
import type { PatientSummary } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class ActivePatientStore {
  readonly patient = signal<PatientSummary | null>(null);

  select(patient: PatientSummary): void {
    this.patient.set(patient);
  }

  clear(): void {
    this.patient.set(null);
  }
}
