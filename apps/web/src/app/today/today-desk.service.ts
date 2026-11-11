import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TodayDesk, WhatsAppSendResponse } from '@expedientes/shared-types';
import { AppointmentService } from '../appointments/appointment.service';

@Injectable({ providedIn: 'root' })
export class TodayDeskService {
  private readonly http = inject(HttpClient);
  private readonly appointments = inject(AppointmentService);

  /** `date` is clinic-local `YYYY-MM-DD`; omitted means today on the clinic's clock. */
  load(date?: string): Promise<TodayDesk> {
    return firstValueFrom(
      this.http.get<{ desk: TodayDesk }>('/api/today', { params: date ? { date } : {} })
    ).then((r) => r.desk);
  }

  /** Resolves with the outcome even for a 409 (`too_soon`), so the caller can say why. */
  async sendReminder(appointmentId: string): Promise<WhatsAppSendResponse> {
    try {
      return await firstValueFrom(
        this.http.post<WhatsAppSendResponse>(`/api/appointments/${appointmentId}/reminder`, {})
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409 && error.error?.result) {
        return error.error as WhatsAppSendResponse;
      }
      throw error;
    }
  }

  setArrived(appointmentId: string, arrived: boolean): Promise<unknown> {
    return this.appointments.update(appointmentId, {
      arrivedAt: arrived ? new Date().toISOString() : null,
    });
  }
}
