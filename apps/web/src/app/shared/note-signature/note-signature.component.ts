import { Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type {
  AddendumKind,
  ClinicalAddendum,
  DiagramViewRecord,
  NoteKind,
  NoteSignature,
  PermissionModule,
} from '@expedientes/shared-types';
import { FacialDiagramViewsComponent } from '../facial-diagram/facial-diagram-views.component';
import type { DiagramDataSource } from '../facial-diagram/diagram-data-source';
import { AddendumDialogComponent, type AddendumDialogData, type AddendumDiagramReferences } from './addendum-dialog.component';
import {
  HistoriaRevisionsDialogComponent,
  type HistoriaRevisionsDialogData,
} from './historia-revisions-dialog.component';
import { NoteSignatureService } from './note-signature.service';
import { SignNoteDialogComponent, type SignNoteDialogData } from './sign-note-dialog.component';

/**
 * The authorship line of a note (NOM-004-SSA3-2012 5.10): who recorded it and when, and its
 * signature — signed (with name, title, licence and time), unsigned with a "Firmar" button for whoever
 * may edit it, or "recorded before electronic signatures" for older notes. `refresh` is bumped by the
 * page after each save, because an edit can void the historia's signature.
 *
 * Phase C: a signed valoración or treatment visit is locked. This line reports `signedChange` so
 * the page can make its form read-only, lists the note's signed addenda under it, and offers
 * "Agregar adenda" instead of editing. The historia clínica is never locked; it offers "Ver
 * historial" with every saved version.
 */
@Component({
  selector: 'app-note-signature',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule, FacialDiagramViewsComponent],
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
        @if (s.signed && addendumKind() && canSign()) {
          <button mat-stroked-button type="button" class="line-action" (click)="openAddendum()">
            <mat-icon>post_add</mat-icon>{{ 'noteSignature.addendum.add' | transloco }}
          </button>
        }
        @if (kind() === 'historiaClinica' && patientId()) {
          <button mat-button type="button" class="line-action" (click)="openHistory()">
            <mat-icon>history</mat-icon>{{ 'noteSignature.history.open' | transloco }}
          </button>
        }
      </div>
      @if (s.signed && addendumKind()) {
        <p class="locked-note">{{ 'noteSignature.lockedNote' | transloco }}</p>
      }
    }

    @if (addenda().length > 0) {
      <ol class="addenda" [attr.aria-label]="'noteSignature.addendum.listLabel' | transloco">
        @for (a of addenda(); track a.id; let i = $index) {
          <li class="addendum">
            <h3>{{ 'noteSignature.addendum.heading' | transloco: { n: i + 1, when: stamp(a.signed.at) } }}</h3>
            @if (a.text) {
              <p class="text">{{ a.text }}</p>
            }
            @if (a.diagrams.length > 0) {
              <app-facial-diagram-views
                [dataSource]="readonlySource"
                [permissionModule]="permissionModule()"
                [diagrams]="asRecords(a)"
                [readonly]="true"
              />
            }
            <p class="state signed">
              <mat-icon aria-hidden="true">verified</mat-icon>
              <span>
                {{ 'noteSignature.signedBy' | transloco: { name: signerName(a.signed), when: stamp(a.signed.at) } }}
                @if (a.signed.license) {
                  <span class="license">· {{ 'noteSignature.license' | transloco: { license: a.signed.license } }}</span>
                }
              </span>
            </p>
          </li>
        }
      </ol>
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
      .line-action mat-icon {
        margin-right: 4px;
      }
      .locked-note {
        margin: -8px 0 16px;
        padding: 0 12px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .addenda {
        list-style: none;
        margin: 0 0 16px;
        padding: 0;
      }
      .addendum {
        padding: 12px;
        border-bottom: 1px solid var(--plate-line);
      }
      .addendum h3 {
        margin: 0 0 4px;
        font-size: 0.875rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .addendum .text {
        margin: 0 0 8px;
        white-space: pre-wrap;
        max-width: 72ch;
      }
      .addendum .state {
        min-height: 32px;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
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
  /** Needed for the historia's "Ver historial". */
  readonly patientId = input('');
  /** The note's own diagrams, offered as a reference when an addendum is drawn. */
  readonly diagramReferences = input<AddendumDiagramReferences | undefined>(undefined);
  /** Emits whether the note is signed each time the line loads, so the page can lock its form. */
  readonly signedChange = output<boolean>();

  private readonly service = inject(NoteSignatureService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly signature = signal<NoteSignature | null>(null);
  protected readonly addenda = signal<ClinicalAddendum[]>([]);

  /** Addenda are only ever read here. */
  protected readonly readonlySource: DiagramDataSource = {
    listReferenceOptions: async () => [],
    getReferenceViews: async () => [],
    save: async () => [],
  };

  constructor() {
    effect(() => {
      const kind = this.kind();
      const id = this.noteId();
      this.refresh();
      if (!id) return;
      this.service
        .get(kind, id)
        .then((s) => {
          if (this.noteId() !== id) return;
          this.signature.set(s);
          this.signedChange.emit(!!s.signed);
        })
        .catch(() => undefined);
      const addendumKind = kind === 'historiaClinica' ? null : kind;
      if (!addendumKind) return;
      this.service
        .addenda(addendumKind, id)
        .then((list) => {
          if (this.noteId() === id) this.addenda.set(list);
        })
        .catch(() => undefined);
    });
  }

  protected addendumKind(): AddendumKind | null {
    const kind = this.kind();
    return kind === 'historiaClinica' ? null : kind;
  }

  protected permissionModule(): PermissionModule {
    return this.kind() === 'valoracion' ? 'valoracion' : this.kind() === 'treatment' ? 'treatments' : 'historia-clinica';
  }

  protected asRecords(a: ClinicalAddendum): DiagramViewRecord[] {
    return a.diagrams.map((d) => ({ view: d.view, data: d.data, updatedAt: a.signed.at }));
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

  protected signerName(sig: { title: string | null; name: string }): string {
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
    if (signed) {
      this.signature.set(signed);
      this.signedChange.emit(!!signed.signed);
    }
  }

  protected async openAddendum(): Promise<void> {
    const kind = this.addendumKind();
    if (!kind) return;
    const added = await firstValueFrom(
      this.dialog
        .open<AddendumDialogComponent, AddendumDialogData, ClinicalAddendum | null>(AddendumDialogComponent, {
          data: { kind, id: this.noteId(), permissionModule: this.permissionModule(), references: this.diagramReferences() },
          width: '720px',
          maxWidth: '95vw',
          autoFocus: false,
        })
        .afterClosed()
    );
    if (added) this.addenda.update((list) => [...list, added]);
  }

  protected openHistory(): void {
    this.dialog.open<HistoriaRevisionsDialogComponent, HistoriaRevisionsDialogData>(HistoriaRevisionsDialogComponent, {
      data: { patientId: this.patientId() },
      width: '720px',
      maxWidth: '95vw',
    });
  }
}
