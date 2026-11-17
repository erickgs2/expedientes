import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CurrentLegalDocuments,
  LegalDocumentPage,
  LegalDocumentSummary,
} from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly http = inject(HttpClient);

  current(): Promise<CurrentLegalDocuments> {
    return firstValueFrom(this.http.get<CurrentLegalDocuments>('/api/legal/current'));
  }

  page(kind: 'privacy' | 'terms', version?: string): Promise<LegalDocumentPage> {
    const query = version ? `?version=${encodeURIComponent(version)}` : '';
    return firstValueFrom(this.http.get<LegalDocumentPage>(`/api/legal/${kind}${query}`));
  }

  accept(documentIds: string[]): Promise<{ pendingLegal: LegalDocumentSummary[] }> {
    return firstValueFrom(
      this.http.post<{ pendingLegal: LegalDocumentSummary[] }>('/api/legal/accept', { documentIds })
    );
  }
}
