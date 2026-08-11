import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ExportModulesSelection {
  historiaClinica: boolean;
  valoracion: boolean;
  treatments: boolean;
  /** Independent of `treatments`: the signed consents can be exported on their own. */
  consents: boolean;
}

export interface ExportDiagramImage {
  key: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly http = inject(HttpClient);

  generateExport(
    patientId: string,
    modules: ExportModulesSelection,
    language: 'es' | 'en',
    diagramImages: ExportDiagramImage[]
  ): Promise<Blob> {
    const formData = new FormData();
    formData.append('modules', JSON.stringify(modules));
    formData.append('language', language);
    for (const { key, blob } of diagramImages) {
      formData.append(key, blob, `${key}.png`);
    }
    return firstValueFrom(
      this.http.post(`/api/patients/${patientId}/export`, formData, { responseType: 'blob' })
    );
  }
}
