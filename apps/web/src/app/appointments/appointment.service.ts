import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Appointment,
  AppointmentSummary,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly http = inject(HttpClient);

  list(from: Date, to: Date): Promise<AppointmentSummary[]> {
    return firstValueFrom(
      this.http.get<{ appointments: AppointmentSummary[] }>('/api/appointments', {
        params: { from: from.toISOString(), to: to.toISOString() },
      })
    ).then((r) => r.appointments);
  }

  get(id: string): Promise<Appointment> {
    return firstValueFrom(
      this.http.get<{ appointment: Appointment }>(`/api/appointments/${id}`)
    ).then((r) => r.appointment);
  }

  create(input: CreateAppointmentInput): Promise<Appointment> {
    return firstValueFrom(
      this.http.post<{ appointment: Appointment }>('/api/appointments', input)
    ).then((r) => r.appointment);
  }

  update(id: string, input: UpdateAppointmentInput): Promise<Appointment> {
    return firstValueFrom(
      this.http.patch<{ appointment: Appointment }>(`/api/appointments/${id}`, input)
    ).then((r) => r.appointment);
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete(`/api/appointments/${id}`)).then(() => undefined);
  }
}
