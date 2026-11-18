import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import type { GrantPremiumResult, PlatformClinicRow } from '@expedientes/shared-types';
import { PlatformService } from './platform.service';
import { shortDate } from './format';

const PRESETS = [1, 3, 6, 12];

/**
 * Give Premium by hand: months, when it starts, and a reason that goes to the audit log. Before
 * confirming it lists each clinic with its plan now and the date its Premium would end.
 */
@Component({
  selector: 'app-grant-premium-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Dar Premium</h2>
    <mat-dialog-content>
      @if (!result()) {
        <p class="field-label">Duración</p>
        <div class="months" role="group" aria-label="Duración en meses">
          @for (m of presets; track m) {
            <button type="button" class="chip" [class.on]="months() === m" (click)="months.set(m)">
              {{ m }} {{ m === 1 ? 'mes' : 'meses' }}
            </button>
          }
          <mat-form-field appearance="outline" class="custom">
            <mat-label>Otro (1 a 24)</mat-label>
            <input matInput type="number" min="1" max="24" [ngModel]="months()" (ngModelChange)="months.set(+$event)" />
          </mat-form-field>
        </div>

        <p class="field-label">Inicio</p>
        <mat-radio-group [ngModel]="start()" (ngModelChange)="start.set($event)" class="start">
          <mat-radio-button value="afterCurrent">Al terminar su Premium actual, si tiene</mat-radio-button>
          <mat-radio-button value="now">Desde hoy</mat-radio-button>
        </mat-radio-group>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Motivo</mat-label>
          <input matInput [(ngModel)]="reason" maxlength="200" placeholder="Cortesía, piloto, compensación, demo…" />
          <mat-hint>Queda en la bitácora.</mat-hint>
        </mat-form-field>

        <table class="preview">
          <thead><tr><th>Clínica</th><th>Ahora</th><th>Premium hasta</th></tr></thead>
          <tbody>
            @for (row of preview(); track row.id) {
              <tr>
                <td>{{ row.name }}</td>
                <td>{{ row.now }}</td>
                <td class="num">{{ row.until }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="note">Fecha aproximada; la exacta se calcula con la zona horaria de cada clínica. El propietario recibe un correo.</p>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      } @else {
        <p>Premium otorgado a {{ result()!.granted.length }} {{ result()!.granted.length === 1 ? 'clínica' : 'clínicas' }}.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (!result()) {
        <button mat-button mat-dialog-close cdkFocusInitial>Cancelar</button>
        <button mat-flat-button [disabled]="!valid() || busy()" (click)="confirm()">
          Dar {{ months() }} {{ months() === 1 ? 'mes' : 'meses' }} de Premium
        </button>
      } @else {
        <button mat-flat-button [mat-dialog-close]="true">Listo</button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .field-label {
        margin: 4px 0 6px;
        font-size: 13px;
        font-weight: 600;
      }
      .months {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .chip {
        border: 1px solid var(--plate-line-strong);
        background: none;
        color: var(--mat-sys-on-surface);
        border-radius: 999px;
        padding: 6px 14px;
        font: inherit;
        cursor: pointer;
        min-height: 36px;
      }
      .chip.on {
        border-color: var(--plate-mark);
        color: var(--plate-mark);
        font-weight: 600;
      }
      .custom {
        width: 140px;
      }
      .start {
        display: flex;
        flex-direction: column;
        margin-bottom: 12px;
      }
      .full {
        width: 100%;
      }
      .preview {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        margin-top: 8px;
      }
      .preview th,
      .preview td {
        text-align: left;
        padding: 6px 8px;
        border-bottom: 1px solid var(--plate-line);
      }
      .num {
        font-variant-numeric: tabular-nums;
      }
      .note {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
      .error {
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class GrantPremiumDialogComponent {
  protected readonly clinics = inject<PlatformClinicRow[]>(MAT_DIALOG_DATA);
  private readonly platform = inject(PlatformService);
  private readonly ref = inject(MatDialogRef<GrantPremiumDialogComponent>);

  protected readonly presets = PRESETS;
  protected readonly months = signal(12);
  protected readonly start = signal<'now' | 'afterCurrent'>('afterCurrent');
  protected reason = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<GrantPremiumResult | null>(null);

  protected readonly valid = computed(
    () => Number.isInteger(this.months()) && this.months() >= 1 && this.months() <= 24
  );

  protected readonly preview = computed(() =>
    this.clinics.map((c) => {
      const currentEnd = c.premiumUntil ? new Date(c.premiumUntil) : null;
      const from = this.start() === 'afterCurrent' && currentEnd && currentEnd > new Date() ? currentEnd : new Date();
      const until = new Date(from);
      until.setMonth(until.getMonth() + (this.valid() ? this.months() : 0));
      return {
        id: c.id,
        name: c.name,
        now: c.tier === 'FREE' ? 'Gratis' : `Premium hasta ${shortDate(c.premiumUntil)}`,
        until: shortDate(until.toISOString()),
      };
    })
  );

  protected async confirm(): Promise<void> {
    if (this.reason.trim().length < 3) {
      this.error.set('Escribe el motivo.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      this.result.set(
        await this.platform.grant({
          clinicIds: this.clinics.map((c) => c.id),
          months: this.months(),
          start: this.start(),
          reason: this.reason.trim(),
        })
      );
    } catch {
      this.error.set('No se pudo otorgar. Revisa los datos e inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    this.ref.close(!!this.result());
  }
}
