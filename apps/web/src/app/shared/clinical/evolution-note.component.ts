import { Component, effect, input, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { VitalSignsComponent } from './vital-signs.component';

/**
 * The nota de evolución of a valoración or treatment visit (NOM-004-SSA3-2012 6.2): evolution,
 * vital signs, results, diagnosis, prognosis and instructions. Every field is optional, so the
 * section starts folded unless it already holds something; the controls live in the parent's form.
 */
@Component({
  selector: 'app-evolution-note',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule, TranslocoModule, VitalSignsComponent],
  template: `
    <section class="evolution" [formGroup]="group()">
      <button type="button" class="toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        <span class="title">{{ 'clinical.evolution.title' | transloco }}</span>
        <span class="optional">{{ 'clinical.optional' | transloco }}</span>
        <mat-icon aria-hidden="true">{{ open() ? 'expand_less' : 'expand_more' }}</mat-icon>
      </button>
      @if (open()) {
        <div class="body">
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'clinical.evolution.evolucion' | transloco }}</mat-label>
            <textarea matInput rows="3" formControlName="evolucion"></textarea>
          </mat-form-field>
          <app-vital-signs [group]="group()" />
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'clinical.fields.resultadosEstudios' | transloco }}</mat-label>
            <textarea matInput rows="2" formControlName="resultadosEstudios"></textarea>
          </mat-form-field>
          <div class="pair">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'clinical.fields.diagnostico' | transloco }}</mat-label>
              <textarea matInput rows="2" formControlName="diagnostico"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'clinical.fields.pronostico' | transloco }}</mat-label>
              <textarea matInput rows="2" formControlName="pronostico"></textarea>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'clinical.evolution.indicaciones' | transloco }}</mat-label>
            <textarea matInput rows="2" formControlName="indicaciones"></textarea>
          </mat-form-field>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .evolution {
        border-top: 1px solid var(--plate-line);
        margin-top: 8px;
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 48px;
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .title {
        font-size: 1rem;
        font-weight: 600;
      }
      .optional {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .toggle mat-icon {
        margin-left: auto;
        color: var(--mat-sys-on-surface-variant);
      }
      .body {
        padding: 8px 0 4px;
      }
      .full {
        width: 100%;
      }
      .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 600px) {
        .pair {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class EvolutionNoteComponent {
  readonly group = input.required<FormGroup>();
  /** Open from the start when the note already holds something. */
  readonly startOpen = input(false);
  protected readonly open = signal(false);

  constructor() {
    effect(() => {
      if (this.startOpen()) this.open.set(true);
    });
  }
}
