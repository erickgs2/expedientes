import { Component, computed, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import { bodyMassIndex } from '@expedientes/shared-types';
import { of, startWith, switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

/**
 * Vital signs in one compact row, each with its unit and tabular numerals (NOM-004-SSA3-2012 6.1.2,
 * 6.2.1). With `withHeight` it adds height and shows the BMI as it is typed. All optional. The
 * controls live in the parent's form group.
 */
@Component({
  selector: 'app-vital-signs',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, TranslocoModule],
  template: `
    <fieldset class="vitals" [formGroup]="group()">
      <legend>{{ 'clinical.vitals.title' | transloco }}</legend>
      <div class="row">
        <div class="pair">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
            <mat-label>{{ 'clinical.vitals.sys' | transloco }}</mat-label>
            <input matInput inputmode="numeric" formControlName="presionSistolica" />
          </mat-form-field>
          <span class="slash" aria-hidden="true">/</span>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
            <mat-label>{{ 'clinical.vitals.dia' | transloco }}</mat-label>
            <input matInput inputmode="numeric" formControlName="presionDiastolica" />
            <span matTextSuffix>mmHg</span>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
          <mat-label>{{ 'clinical.vitals.hr' | transloco }}</mat-label>
          <input matInput inputmode="numeric" formControlName="frecuenciaCardiaca" />
          <span matTextSuffix>lpm</span>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
          <mat-label>{{ 'clinical.vitals.rr' | transloco }}</mat-label>
          <input matInput inputmode="numeric" formControlName="frecuenciaRespiratoria" />
          <span matTextSuffix>rpm</span>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
          <mat-label>{{ 'clinical.vitals.temp' | transloco }}</mat-label>
          <input matInput inputmode="decimal" formControlName="temperatura" />
          <span matTextSuffix>°C</span>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
          <mat-label>{{ 'clinical.vitals.weight' | transloco }}</mat-label>
          <input matInput inputmode="decimal" formControlName="peso" />
          <span matTextSuffix>kg</span>
        </mat-form-field>
        @if (withHeight()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="n3">
            <mat-label>{{ 'clinical.vitals.height' | transloco }}</mat-label>
            <input matInput inputmode="decimal" formControlName="talla" />
            <span matTextSuffix>cm</span>
          </mat-form-field>
          <p class="bmi" aria-live="polite">
            <span class="bmi-label">{{ 'clinical.vitals.bmi' | transloco }}</span>
            <strong>{{ bmi() ?? '—' }}</strong>
          </p>
        }
      </div>
    </fieldset>
  `,
  styles: [
    `
      .vitals {
        border: none;
        margin: 0 0 16px;
        padding: 0;
        min-width: 0;
      }
      legend {
        padding: 0;
        margin-bottom: 8px;
        font-size: 0.875rem;
        font-weight: 600;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        font-variant-numeric: tabular-nums;
      }
      .pair {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .slash {
        color: var(--mat-sys-on-surface-variant);
      }
      .n3 {
        width: 120px;
      }
      .pair .n3:first-child {
        width: 96px;
      }
      .pair .n3:last-child {
        width: 132px;
      }
      .bmi {
        display: flex;
        flex-direction: column;
        margin: 0;
        min-width: 64px;
      }
      .bmi-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .bmi strong {
        font-size: 1.125rem;
        font-weight: 600;
      }
    `,
  ],
})
export class VitalSignsComponent {
  readonly group = input.required<FormGroup>();
  readonly withHeight = input(false);

  private readonly values = toSignal(
    toObservable(this.group).pipe(
      switchMap((g) => (g ? g.valueChanges.pipe(startWith(g.getRawValue())) : of({})))
    ),
    { initialValue: {} as Record<string, unknown> }
  );

  protected readonly bmi = computed(() => {
    const v = this.values() as Record<string, string | undefined>;
    const n = (s: string | undefined) => (s ? Number(String(s).replace(',', '.')) : null);
    const bmi = bodyMassIndex(n(v['peso']), n(v['talla']));
    return bmi === null || !Number.isFinite(bmi) ? null : bmi.toFixed(1);
  });
}
