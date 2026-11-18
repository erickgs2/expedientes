import { Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { NoteKind, NoteSignature } from '@expedientes/shared-types';
import { NoteSignatureService } from './note-signature.service';
import { SignNoteDialogComponent, type SignNoteDialogData } from './sign-note-dialog.component';

/**
 * The authorship line of a note (NOM-004-SSA3-2012 5.10): who recorded it and when, and its
 * signature — signed (with name, title, licence and time), unsigned with a "Firmar" button for whoever
 * may edit it, or "recorded before electronic signatures" for older notes. `refresh` is bumped by the
 * page after each save, because an edit voids a signature that no longer matches.
 */
@Component({
  selector: 'app-note-signature',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    @if (signature(); as s) {
      <div class="note-signature" [class.is-signed]="!!s.signed">
        <p class="recorded">
          @if (s.createdByName) {
            {{ 'noteSignature.recordedBy' | transloco: { name: s.createdByName, when: stamp(s.createdAt) } }}
          } @else {
            {{ 'noteSignature.recordedAt' | transloco: { when: stamp(s.createdAt) } }}
          }
        </p>
        @if (s.signed; as sig) {
          <p class="state signed">
            <mat-icon aria-hidden="true">verified</mat-icon>
            <span>
              {{ 'noteSignature.signedBy' | transloco: { name: signerName(sig), when: stamp(sig.at) } }}
              @if (sig.license) {
                <span class="license">· {{ 'noteSignature.license' | transloco: { license: sig.license } }}</span>
              }
            </span>
          </p>
        } @else if (s.legacy) {
          <p class="state muted">{{ 'noteSignature.legacy' | transloco }}</p>
        } @else {
          <p class="state unsigned">
            <span class="dot" aria-hidden="true"></span>
            <span>{{ 'noteSignature.unsigned' | transloco }}</span>
            @if (canSign()) {
              <button mat-stroked-button type="button" (click)="openSign()">
                <mat-icon>draw</mat-icon>{{ 'noteSignature.sign' | transloco }}
              </button>
            }
          </p>
        }
      </div>
    }
  `,
  styles: [
    `
      .note-signature {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 16px;
        margin: 0 0 16px;
        padding: 8px 12px;
        border-top: 1px solid var(--plate-line);
        border-bottom: 1px solid var(--plate-line);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      p {
        margin: 0;
      }
      .recorded {
        flex: 1 1 260px;
        color: var(--mat-sys-on-surface-variant);
      }
      .state {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
      }
      .signed {
        color: var(--mat-sys-on-surface);
        font-weight: 500;
      }
      .signed mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--mat-sys-on-surface-variant);
      }
      .license {
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
      /* An unsigned note is a pending action: the one rose mark on the line. */
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
    `,
  ],
})
export class NoteSignatureComponent {
  readonly kind = input.required<NoteKind>();
  readonly noteId = input.required<string>();
  readonly canSign = input(false);
  /** Bump after each save so a voided signature shows at once. */
  readonly refresh = input(0);

  private readonly service = inject(NoteSignatureService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly signature = signal<NoteSignature | null>(null);

  constructor() {
    effect(() => {
      const kind = this.kind();
      const id = this.noteId();
      this.refresh();
      if (!id) return;
      this.service
        .get(kind, id)
        .then((s) => {
          if (this.noteId() === id) this.signature.set(s);
        })
        .catch(() => undefined);
    });
  }

  protected stamp(iso: string): string {
    return new Date(iso).toLocaleString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected signerName(sig: NonNullable<NoteSignature['signed']>): string {
    return [sig.title, sig.name].filter(Boolean).join(' ');
  }

  protected async openSign(): Promise<void> {
    const signed = await firstValueFrom(
      this.dialog
        .open<SignNoteDialogComponent, SignNoteDialogData, NoteSignature | null>(SignNoteDialogComponent, {
          data: { kind: this.kind(), id: this.noteId() },
          width: '440px',
          maxWidth: '95vw',
        })
        .afterClosed()
    );
    if (signed) this.signature.set(signed);
  }
}
