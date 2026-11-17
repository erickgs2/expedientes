export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/** An appointment as returned by the list endpoint — denormalized patient name and treatment type
 * names so the calendar can render every visible appointment without a per-row round trip. */
export interface AppointmentSummary {
  id: string;
  patientId: string;
  patientName: string;
  startTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  treatmentTypeNames: string[];
}

/** Full appointment detail, returned by the get/create/update endpoints — adds `notes` and the raw
 * `treatmentTypeIds` the edit dialog needs to pre-check the right catalog checkboxes. */
export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  startTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  /** When reception registered the patient's arrival. */
  arrivedAt?: string | null;
  treatmentTypeIds: string[];
  treatmentTypeNames: string[];
}

export interface CreateAppointmentInput {
  patientId: string;
  startTime: string;
  durationMinutes: number;
  notes?: string | null;
  treatmentTypeIds?: string[];
}

export interface UpdateAppointmentInput {
  /** ISO time the patient arrived; `null` undoes a check-in. */
  arrivedAt?: string | null;
  patientId?: string;
  startTime?: string;
  durationMinutes?: number;
  status?: AppointmentStatus;
  notes?: string | null;
  treatmentTypeIds?: string[];
}
