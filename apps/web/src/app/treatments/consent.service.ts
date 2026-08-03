import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Consent, TreatmentItemDetail } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly http = inject(HttpClient);

  getItem(itemId: string): Promise<TreatmentItemDetail> {
    return firstValueFrom(
      this.http.get<{ item: TreatmentItemDetail }>(`/api/treatment-items/${itemId}`)
    ).then((r) => r.item);
  }

  sign(itemId: string, signature: Blob): Promise<Consent> {
    const formData = new FormData();
    formData.append('signature', signature, 'signature.jpg');
    return firstValueFrom(
      this.http.post<{ consent: Consent }>(`/api/treatment-items/${itemId}/consent`, formData)
    ).then((r) => r.consent);
  }
}
