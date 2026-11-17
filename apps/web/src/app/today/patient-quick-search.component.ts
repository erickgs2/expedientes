import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientsService } from '../patient-drive/patients.service';

/**
 * The search the working day starts with: type, see matches, Enter opens the first one. Moved out
 * of the Today screen unchanged so the desk layout can place it in its header.
 */
@Component({
  selector: 'app-patient-quick-search',
  standalone: true,
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoModule],
  template: `
    <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
      <mat-label>{{ 'today.desk.searchLabel' | transloco }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input
        matInput
        type="search"
        [ngModel]="query()"
        (ngModelChange)="onQueryChange($event)"
        (keydown.enter)="openFirst()"
        autocomplete="off"
      />
    </mat-form-field>

    @if (query().trim()) {
      <ul class="results" [attr.aria-label]="'today.results' | transloco">
        @for (patient of results(); track patient.id) {
          <li>
            <a class="result-row" [routerLink]="['/pacientes', patient.id]">
              <span class="result-name">{{ patient.fullName }}</span>
              <span class="result-meta">
                {{ patient.phone }}{{ patient.documentId ? ' · ' + patient.documentId : '' }}
              </span>
            </a>
          </li>
        } @empty {
          @if (!searching()) {
            <li class="no-results">{{ 'today.noResults' | transloco }}</li>
          }
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .search {
        width: 100%;
      }
      .results {
        position: absolute;
        z-index: 3;
        left: 0;
        right: 0;
        top: calc(100% + 4px);
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 360px;
        overflow: auto;
        background: var(--mat-sys-surface);
        border: 1px solid var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
      .results li + li {
        border-top: 1px solid var(--plate-line);
      }
      .result-row {
        box-sizing: border-box;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 12px;
        min-height: 56px;
        padding: 12px 16px;
        color: inherit;
        text-decoration: none;
      }
      .result-row:hover,
      .result-row:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .result-name {
        font-weight: 600;
      }
      .result-meta {
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .no-results {
        padding: 16px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PatientQuickSearchComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly results = signal<PatientSummary[]>([]);
  protected readonly searching = signal(false);

  private latestSearch: Promise<void> = Promise.resolve();
  private searchSeq = 0;

  protected onQueryChange(value: string): void {
    this.query.set(value);
    const seq = ++this.searchSeq;
    if (!value.trim()) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.latestSearch = this.patientsService
      .search(value)
      .then((patients) => {
        // Only the newest keystroke may write results; an older, slower response must not win.
        if (seq === this.searchSeq) this.results.set(patients);
      })
      .catch(() => {
        if (seq === this.searchSeq) this.results.set([]);
      })
      .finally(() => {
        if (seq === this.searchSeq) this.searching.set(false);
      });
  }

  protected async openFirst(): Promise<void> {
    await this.latestSearch;
    const first = this.results()[0];
    if (first) await this.router.navigate(['/pacientes', first.id]);
  }
}
