import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Consent, ConsentBlock, TreatmentItemDetail } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly http = inject(HttpClient);

  getItem(itemId: string): Promise<TreatmentItemDetail> {
    return firstValueFrom(
      this.http.get<{ item: TreatmentItemDetail }>(`/api/treatment-items/${itemId}`)
    ).then((r) => r.item);
  }

  sign(
    itemId: string,
    input: {
      place: string;
      patientIdentification: string;
      witnessName: string | null;
      patientSignature: Blob;
      witnessSignature: Blob | null;
      templateUpdatedAt: string;
      settingsUpdatedAt: string;
    }
  ): Promise<{ consent: Consent; consentDocument: ConsentBlock[] }> {
    const formData = new FormData();
    formData.append('patientSignature', input.patientSignature, 'signature.jpg');
    if (input.witnessSignature) {
      formData.append('witnessSignature', input.witnessSignature, 'witness.jpg');
    }
    formData.append('place', input.place);
    formData.append('patientIdentification', input.patientIdentification);
    if (input.witnessName) formData.append('witnessName', input.witnessName);
    formData.append('templateUpdatedAt', input.templateUpdatedAt);
    formData.append('settingsUpdatedAt', input.settingsUpdatedAt);
    return firstValueFrom(
      this.http.post<{ consent: Consent; consentDocument: ConsentBlock[] }>(
        `/api/treatment-items/${itemId}/consent`,
        formData
      )
    );
  }
}
