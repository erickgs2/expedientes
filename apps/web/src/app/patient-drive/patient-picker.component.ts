import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientsService } from './patients.service';

/**
 * Picks the companion whose phone will receive a patient's notices. Only patients who can be a
 * contact are offered: someone with a phone of their own who does not already use a contact
 * (links stay one level deep), and never the patient being edited.
 */
@Component({
  selector: 'app-patient-picker',
  standalone: true,
  imports: [FormsModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoModule],
  template: `
    @if (selected(); as s) {
      <div class="chosen">
        <mat-icon aria-hidden="true">group</mat-icon>
        <span class="who">
          <strong>{{ s.fullName }}</strong>
          <span class="meta">{{ s.phone }}</span>
        </span>
        <button mat-button type="button" (click)="clear()">{{ 'companions.change' | transloco }}</button>
      </div>
    } @else {
      <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
        <mat-label>{{ label() | transloco }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          [ngModel]="query()"
          (ngModelChange)="onQuery($event)"
          [matAutocomplete]="auto"
          autocomplete="off"
        />
        <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pick($event)">
          @for (p of results(); track p.id) {
            <mat-option [value]="p">
              <span class="option-name">{{ p.fullName }}</span>
              <span class="option-meta"> · {{ p.phone }}</span>
            </mat-option>
          }
        </mat-autocomplete>
        <mat-hint>{{ 'companions.pickerHint' | transloco }}</mat-hint>
      </mat-form-field>
    }
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .chosen {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
        padding: 6px 8px 6px 14px;
        border: 1px solid var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
      .chosen mat-icon {
        color: var(--mat-sys-on-surface-variant);
      }
      .who {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .meta,
      .option-meta {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class PatientPickerComponent {
  private readonly patientsService = inject(PatientsService);

  /** The patient being edited, never offered as their own contact. */
  readonly excludeId = input<string | null>(null);
  readonly label = input('companions.pickerLabel');
  readonly selected = input<PatientSummary | null>(null);
  readonly selectedChange = output<PatientSummary | null>();

  protected readonly query = signal('');
  protected readonly results = signal<PatientSummary[]>([]);
  private seq = 0;

  protected async onQuery(value: string | PatientSummary): Promise<void> {
    if (typeof value !== 'string') return;
    this.query.set(value);
    const seq = ++this.seq;
    if (!value.trim()) {
      this.results.set([]);
      return;
    }
    try {
      const found = await this.patientsService.search(value);
      if (seq !== this.seq) return;
      this.results.set(
        found.filter((p) => p.id !== this.excludeId() && !p.contactPatientId && p.phone.trim() !== '')
      );
    } catch {
      if (seq === this.seq) this.results.set([]);
    }
  }

  protected pick(event: MatAutocompleteSelectedEvent): void {
    this.selectedChange.emit(event.option.value as PatientSummary);
    this.query.set('');
    this.results.set([]);
  }

  protected clear(): void {
    this.selectedChange.emit(null);
  }
}
