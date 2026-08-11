import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ClinicSettings, ClinicSettingsInput } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class ClinicSettingsService {
  private readonly http = inject(HttpClient);

  get(): Promise<ClinicSettings | null> {
    return firstValueFrom(
      this.http.get<{ clinicSettings: ClinicSettings | null }>('/api/clinic-settings')
    ).then((r) => r.clinicSettings);
  }

  save(input: ClinicSettingsInput, signature: Blob | null): Promise<ClinicSettings> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(input)) {
      formData.append(key, value);
    }
    if (signature) formData.append('doctorSignature', signature, 'signature.jpg');
    return firstValueFrom(
      this.http.put<{ clinicSettings: ClinicSettings }>('/api/clinic-settings', formData)
    ).then((r) => r.clinicSettings);
  }
}
