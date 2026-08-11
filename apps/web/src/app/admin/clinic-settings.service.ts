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

  save(
    input: ClinicSettingsInput,
    signature: Blob | null,
    logo: File | null
  ): Promise<ClinicSettings> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(input)) {
      formData.append(key, value);
    }
    if (signature) formData.append('doctorSignature', signature, 'signature.jpg');
    // Sent under its original filename so the server can tell a PNG logo from a JPEG one; it still
    // verifies the actual bytes rather than trusting the name.
    if (logo) formData.append('clinicLogo', logo, logo.name);
    return firstValueFrom(
      this.http.put<{ clinicSettings: ClinicSettings }>('/api/clinic-settings', formData)
    ).then((r) => r.clinicSettings);
  }
}
