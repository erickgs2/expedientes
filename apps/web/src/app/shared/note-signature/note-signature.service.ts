import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { NoteKind, NoteSignature, UnsignedNote, UserProfile } from '@expedientes/shared-types';
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
}
