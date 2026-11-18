import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  AddendumKind,
  ClinicalAddendum,
  HistoriaRevision,
  NoteKind,
  NoteSignature,
  UnsignedNote,
  UserProfile,
} from '@expedientes/shared-types';
import { HANDLES_OWN_ERRORS } from '../../auth/http-context';

@Injectable({ providedIn: 'root' })
export class NoteSignatureService {
  private readonly http = inject(HttpClient);

  get(kind: NoteKind, id: string): Promise<NoteSignature> {
    return firstValueFrom(
      this.http.get<{ signature: NoteSignature }>('/api/notes/signature', { params: { kind, id } })
    ).then((r) => r.signature);
  }

  /** Errors (wrong PIN, no PIN or licence yet) are shown by the signing dialog itself. */
  sign(kind: NoteKind, id: string, pin: string): Promise<NoteSignature> {
    return firstValueFrom(
      this.http.post<{ signature: NoteSignature }>(
        '/api/notes/sign',
        { kind, id, pin },
        { context: new HttpContext().set(HANDLES_OWN_ERRORS, true) }
      )
    ).then((r) => r.signature);
  }

  unsigned(): Promise<UnsignedNote[]> {
    return firstValueFrom(this.http.get<{ notes: UnsignedNote[] }>('/api/notes/unsigned')).then((r) => r.notes);
  }

  profile(): Promise<UserProfile> {
    return firstValueFrom(this.http.get<{ profile: UserProfile }>('/api/me/profile')).then((r) => r.profile);
  }

  updateProfile(changes: { professionalTitle: string; professionalLicense: string }): Promise<UserProfile> {
    return firstValueFrom(this.http.patch<{ profile: UserProfile }>('/api/me/profile', changes)).then((r) => r.profile);
  }

  setPin(currentPassword: string, pin: string): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(
        '/api/me/signing-pin',
        { currentPassword, pin },
        { context: new HttpContext().set(HANDLES_OWN_ERRORS, true) }
      )
    );
  }

  addenda(kind: AddendumKind, id: string): Promise<ClinicalAddendum[]> {
    return firstValueFrom(
      this.http.get<{ addenda: ClinicalAddendum[] }>('/api/notes/addenda', { params: { kind, id } })
    ).then((r) => r.addenda);
  }

  /** Writes and signs an addendum in one step. Errors are shown by the addendum dialog itself. */
  addAddendum(
    kind: AddendumKind,
    id: string,
    input: { text: string; diagrams: ClinicalAddendum['diagrams']; pin: string }
  ): Promise<ClinicalAddendum> {
    return firstValueFrom(
      this.http.post<{ addendum: ClinicalAddendum }>(
        '/api/notes/addenda',
        { kind, id, ...input },
        { context: new HttpContext().set(HANDLES_OWN_ERRORS, true) }
      )
    ).then((r) => r.addendum);
  }

  historiaRevisions(patientId: string): Promise<HistoriaRevision[]> {
    return firstValueFrom(
      this.http.get<{ revisions: HistoriaRevision[] }>(`/api/patients/${patientId}/historia-clinica/revisions`)
    ).then((r) => r.revisions);
  }
}
