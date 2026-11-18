import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  findLegalPlaceholders,
  type LegalDocumentKind,
  type PlatformLegalOverview,
  type PlatformLegalVersion,
} from '@expedientes/shared-types';
import { LegalDocumentViewComponent } from '../legal/legal-document-view.component';
import { PlatformService } from './platform.service';
import { diffLines } from './line-diff';
import { dateTime } from './format';

const KIND_LABEL: Record<LegalDocumentKind, string> = {
  PRIVACY: 'Aviso de privacidad',
  TERMS: 'Términos y condiciones',
};

/**
 * The privacy notice and terms: every version with how many users accepted it, and an editor to
 * publish a new one (Markdown with preview, comparison against the version in force, a required
 * summary that is what users receive by email). Published versions are never edited.
 */
@Component({
  selector: 'app-platform-legal',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    LegalDocumentViewComponent,
  ],
  template: `
    <h1 class="title">Documentos legales</h1>

    @if (overview(); as o) {
      <div class="docs">
        @for (kind of kinds; track kind) {
          <section class="plate">
            <h2>{{ label(kind) }}</h2>
            <table>
              <thead><tr><th>Versión</th><th>Vigente desde</th><th class="num">Aceptación</th><th></th></tr></thead>
              <tbody>
                @for (v of o.documents[kind]; track v.id) {
                  <tr>
                    <td>
                      v{{ v.version }}
                      @if (v.current) { <span class="current">vigente</span> }
                      @if (v.requiresAcceptance) { <span class="req">exige aceptación</span> }
                    </td>
                    <td class="num">{{ stamp(v.effectiveFrom) }}</td>
                    <td class="num">{{ v.acceptedCount }} de {{ o.activeUsers }} · {{ percent(v) }}%</td>
                    <td><button mat-button type="button" (click)="startFrom(kind, v)">Usar como base</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      </div>

      <section class="plate editor" id="publicar">
        <h2>Publicar una versión nueva</h2>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Documento</mat-label>
            <mat-select [ngModel]="kind()" (ngModelChange)="kind.set($event)">
              @for (k of kinds; track k) {
                <mat-option [value]="k">{{ label(k) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="short">
            <mat-label>Versión</mat-label>
            <input matInput [(ngModel)]="version" placeholder="1.1" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Entra en vigor</mat-label>
            <input matInput type="datetime-local" [(ngModel)]="effectiveFrom" />
          </mat-form-field>
        </div>

        <div class="split">
          <mat-form-field appearance="outline" class="body">
            <mat-label>Texto (Markdown)</mat-label>
            <textarea matInput rows="22" [ngModel]="body()" (ngModelChange)="body.set($event)"></textarea>
          </mat-form-field>
          <div class="preview" aria-label="Vista previa">
            <app-legal-document-view [markdown]="body() || '_Sin texto_'" />
          </div>
        </div>

        @if (placeholders().length) {
          <p class="warn" role="alert">
            Faltan datos por llenar: {{ placeholders().join(', ') }}. No se puede publicar con marcadores entre corchetes.
          </p>
        }

        @if (diff(); as d) {
          <details class="diff">
            <summary>Cambios contra la versión vigente: +{{ d.added }} / −{{ d.removed }} líneas</summary>
            <div class="diff-lines">
              @for (line of d.lines; track $index) {
                @if (line.kind !== 'same') {
                  <div [class]="line.kind"><span class="sign">{{ line.kind === 'added' ? '+' : '−' }}</span>{{ line.text || ' ' }}</div>
                }
              }
            </div>
          </details>
        }

        <mat-form-field appearance="outline" class="full">
          <mat-label>Resumen de cambios</mat-label>
          <textarea matInput rows="3" [(ngModel)]="changeSummary" maxlength="2000"></textarea>
          <mat-hint>Es lo que reciben los usuarios por correo.</mat-hint>
        </mat-form-field>
        <mat-checkbox [(ngModel)]="requiresAcceptance">
          Exige nueva aceptación (nuevas finalidades, datos o proveedores)
        </mat-checkbox>

        @if (error()) {
          <p class="warn" role="alert">{{ error() }}</p>
        }
        @if (published()) {
          <p class="ok" role="status">{{ published() }}</p>
        }
        <div class="publish">
          @if (confirming()) {
            <span>Se enviará un correo a {{ o.activeUsers }} usuarios. Una versión publicada no se puede editar.</span>
            <button mat-button type="button" (click)="confirming.set(false)">Cancelar</button>
            <button mat-flat-button type="button" [disabled]="busy()" (click)="publish()">Publicar</button>
          } @else {
            <button mat-flat-button type="button" [disabled]="!canPublish()" (click)="confirming.set(true)">Revisar y publicar</button>
          }
        </div>
      </section>
    } @else {
      <span class="skeleton" style="height: 160px"></span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1280px;
      }
      .title {
        font-size: 1.875rem;
        font-weight: 700;
        letter-spacing: -0.015em;
        margin: 0 0 20px;
      }
      .plate {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        padding: 20px;
      }
      .docs {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th {
        text-align: left;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        padding: 8px;
        border-bottom: 1px solid var(--plate-line-strong);
      }
      td {
        padding: 8px;
        border-bottom: 1px solid var(--plate-line);
      }
      .num {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      th.num,
      td.num:nth-child(3) {
        text-align: right;
      }
      .current {
        margin-left: 6px;
        color: var(--plate-mark);
        font-weight: 600;
        font-size: 12px;
      }
      .req {
        margin-left: 6px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .short {
        width: 120px;
      }
      .split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        align-items: start;
      }
      @media (max-width: 1000px) {
        .split {
          grid-template-columns: 1fr;
        }
      }
      .body {
        width: 100%;
      }
      .body textarea {
        font-family: Menlo, Consolas, monospace;
        font-size: 13px;
        line-height: 1.5;
      }
      .preview {
        max-height: 560px;
        overflow-y: auto;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        padding: 12px 16px;
      }
      .warn {
        color: var(--mat-sys-error);
      }
      .ok {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .diff {
        margin: 8px 0 16px;
      }
      .diff summary {
        cursor: pointer;
        font-size: 14px;
      }
      .diff-lines {
        max-height: 280px;
        overflow-y: auto;
        font-family: Menlo, Consolas, monospace;
        font-size: 12px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        margin-top: 8px;
        padding: 8px 0;
      }
      .diff-lines div {
        padding: 0 12px;
        white-space: pre-wrap;
      }
      .added {
        background: color-mix(in srgb, var(--chart-series-3) 14%, transparent);
      }
      .removed {
        background: color-mix(in srgb, var(--mat-sys-error) 12%, transparent);
        text-decoration: line-through;
        text-decoration-color: color-mix(in srgb, var(--mat-sys-on-surface) 40%, transparent);
      }
      .sign {
        display: inline-block;
        width: 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .full {
        width: 100%;
        margin-top: 8px;
      }
      .publish {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
      }
    `,
  ],
})
export class PlatformLegalComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly kinds: LegalDocumentKind[] = ['PRIVACY', 'TERMS'];
  protected readonly overview = signal<PlatformLegalOverview | null>(null);
  protected readonly kind = signal<LegalDocumentKind>('PRIVACY');
  protected readonly body = signal('');
  private readonly baseBody = signal<string | null>(null);
  protected version = '';
  protected changeSummary = '';
  protected effectiveFrom = '';
  protected requiresAcceptance = false;
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly published = signal<string | null>(null);
  protected readonly stamp = dateTime;

  protected readonly placeholders = computed(() => findLegalPlaceholders(this.body()));

  protected readonly diff = computed(() => {
    const base = this.baseBody();
    if (base === null || !this.body()) return null;
    const lines = diffLines(base, this.body());
    return {
      lines,
      added: lines.filter((l) => l.kind === 'added').length,
      removed: lines.filter((l) => l.kind === 'removed').length,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected label(kind: LegalDocumentKind): string {
    return KIND_LABEL[kind];
  }

  protected percent(v: PlatformLegalVersion): number {
    const total = this.overview()?.activeUsers ?? 0;
    return total ? Math.round((v.acceptedCount / total) * 100) : 0;
  }

  protected canPublish(): boolean {
    return (
      /^\d{1,3}(\.\d{1,3}){0,2}$/.test(this.version.trim()) &&
      this.body().trim().length >= 200 &&
      this.placeholders().length === 0 &&
      this.changeSummary.trim().length >= 3
    );
  }

  /** Loads a version's text into the editor, compared against the version in force. */
  protected async startFrom(kind: LegalDocumentKind, from: PlatformLegalVersion): Promise<void> {
    this.kind.set(kind);
    const current = this.overview()?.documents[kind].find((v) => v.current);
    const [text, currentText] = await Promise.all([
      this.platform.legalBody(from.id),
      current && current.id !== from.id ? this.platform.legalBody(current.id) : Promise.resolve(null),
    ]);
    this.body.set(text);
    this.baseBody.set(currentText ?? text);
    const [major, minor = '0'] = (current ?? from).version.split('.');
    this.version = `${major}.${Number(minor) + 1}`;
    this.published.set(null);
    document.getElementById('publicar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected async publish(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { recipients } = await this.platform.publishLegal({
        kind: this.kind(),
        version: this.version.trim(),
        body: this.body(),
        changeSummary: this.changeSummary.trim(),
        effectiveFrom: this.effectiveFrom ? new Date(this.effectiveFrom).toISOString() : new Date().toISOString(),
        requiresAcceptance: this.requiresAcceptance,
      });
      this.published.set(`Publicada la versión ${this.version}. Avisando por correo a ${recipients} usuarios.`);
      this.confirming.set(false);
      this.body.set('');
      this.baseBody.set(null);
      this.changeSummary = '';
      this.version = '';
      await this.load();
    } catch (error) {
      const body = (error as { error?: { error?: { message?: string } } }).error?.error;
      this.error.set(body?.message ?? 'No se pudo publicar.');
      this.confirming.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    this.overview.set(await this.platform.legal());
  }
}
