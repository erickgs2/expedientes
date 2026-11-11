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

  /** The unsigned letter as a PDF with blank signature lines, to print and sign by hand. */
  printBlank(itemId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`/api/treatment-items/${itemId}/consent/print`, { responseType: 'blob' })
    );
  }

  /** One scan (one or more image pages) that carries the handwritten signatures of several letters. */
  registerScan(
    treatmentId: string,
    input: {
      itemIds: string[];
      signedDate: string;
      place: string;
      patientIdentification: string;
      witnessName: string | null;
      pages: File[];
    }
  ): Promise<{ scanId: string; consentIds: string[] }> {
    const formData = new FormData();
    for (const id of input.itemIds) formData.append('itemIds', id);
    formData.append('signedDate', input.signedDate);
    formData.append('place', input.place);
    formData.append('patientIdentification', input.patientIdentification);
    if (input.witnessName) formData.append('witnessName', input.witnessName);
    for (const page of input.pages) formData.append('pages', page, page.name);
    return firstValueFrom(
      this.http.post<{ scanId: string; consentIds: string[] }>(
        `/api/treatments/${treatmentId}/consent-scan`,
        formData
      )
    );
  }
}
