import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { HistoriaRevision } from '@expedientes/shared-types';
import { NoteSignatureService } from './note-signature.service';

export interface HistoriaRevisionsDialogData {
  patientId: string;
}

/** Content keys whose label lives under another name in the form's translations. */
const FIELD_LABEL: Record<string, string> = { allergies: 'alergias' };

/**
 * Every saved version of the historia clínica, newest first (NOM-004-SSA3-2012 5.10): who saved it
 * and when, whether that version was signed, and which answers changed from the version before,
 * old value struck beside the new one. Read-only; the current version is edited in the form.
 */
@Component({
  selector: 'app-historia-revisions-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'noteSignature.history.title' | transloco }}</h2>
    <mat-dialog-content>
      @if (revisions(); as list) {
        <ol class="revisions">
          @for (r of list; track r.revision; let first = $first) {
            <li class="revision">
              <div class="head">
                <span class="number">{{ 'noteSignature.history.version' | transloco: { n: r.revision } }}</span>
                @if (first) {
                  <span class="current">{{ 'noteSignature.history.current' | transloco }}</span>
                }
                <span class="who">
                  {{ r.changedByName ?? ('noteSignature.history.unknownAuthor' | transloco) }} · {{ stamp(r.changedAt) }}
                </span>
              </div>
              <p class="state">
                @if (r.signed; as sig) {
                  <mat-icon aria-hidden="true">verified</mat-icon>
                  {{ 'noteSignature.signedBy' | transloco: { name: signer(sig), when: stamp(sig.at) } }}
                } @else if (r.legacy) {
                  {{ 'noteSignature.legacy' | transloco }}
                } @else {
                  {{ 'noteSignature.unsigned' | transloco }}
                }
              </p>
              @if (r.changes.length > 0) {
                <dl class="changes">
                  @for (c of r.changes; track c.field) {
                    <div class="change">
                      <dt>{{ label(c.field) }}</dt>
                      <dd>
                        <del>{{ show(c.before) }}</del>
                        <span class="arrow" aria-hidden="true">→</span>
                        <ins>{{ show(c.after) }}</ins>
                      </dd>
                    </div>
                  }
                </dl>
              } @else if (r.revision === 1) {
                <p class="note">{{ 'noteSignature.history.first' | transloco }}</p>
              }
            </li>
          }
        </ol>
      } @else if (failed()) {
        <p role="alert">{{ 'noteSignature.history.failed' | transloco }}</p>
      } @else {
        <div class="loading"><mat-spinner diameter="32" /></div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'common.close' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .revisions {
        list-style: none;
        margin: 0;
        padding: 0;
        max-width: 640px;
      }
      .revision {
        padding: 12px 0;
        border-top: 1px solid var(--plate-line);
        font-variant-numeric: tabular-nums;
      }
      .revision:first-child {
        border-top: none;
        padding-top: 0;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 12px;
      }
      .number {
        font-weight: 600;
      }
      .current {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .who {
        margin-left: auto;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .state {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .state mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .changes {
        margin: 8px 0 0;
      }
      .change {
        display: grid;
        grid-template-columns: minmax(140px, 220px) 1fr;
        gap: 4px 16px;
        padding: 4px 0;
        font-size: 13px;
      }
      dt {
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 0;
      }
      del {
        color: var(--mat-sys-on-surface-variant);
      }
      ins {
        text-decoration: none;
        font-weight: 500;
      }
      .arrow {
        margin: 0 6px;
        color: var(--mat-sys-on-surface-variant);
      }
      .note {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .loading {
        display: flex;
        justify-content: center;
        padding: 24px;
      }
      @media (max-width: 520px) {
        .change {
          grid-template-columns: 1fr;
        }
        .who {
          margin-left: 0;
        }
      }
    `,
  ],
})
export class HistoriaRevisionsDialogComponent implements OnInit {
  private readonly data = inject<HistoriaRevisionsDialogData>(MAT_DIALOG_DATA);
  private readonly service = inject(NoteSignatureService);
  private readonly transloco = inject(TranslocoService);

  protected readonly revisions = signal<HistoriaRevision[] | null>(null);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.service
      .historiaRevisions(this.data.patientId)
      .then((list) => this.revisions.set(list))
      .catch(() => this.failed.set(true));
  }

  protected label(field: string): string {
    const key = `historiaClinica.fields.${FIELD_LABEL[field] ?? field}`;
    const text = this.transloco.translate(key);
    return text === key ? field : text;
  }

  protected show(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return this.transloco.translate(value ? 'common.yes' : 'common.no');
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.substring(0, 10);
    return String(value);
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

  protected signer(sig: NonNullable<HistoriaRevision['signed']>): string {
    return [sig.title, sig.name].filter(Boolean).join(' ');
  }
}
