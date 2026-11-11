import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule, MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { TreatmentTypeWithUsage } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { AuthService } from '../auth/auth.service';
import { TreatmentTypesService } from './treatment-types.service';
import {
  TreatmentTypeFormDialogComponent,
  TreatmentTypeFormDialogData,
} from './treatment-type-form-dialog.component';
import { CONSENT_SECTIONS, sectionFlags } from './treatment-consent-sections';

type CatalogFilter = 'active' | 'incomplete' | 'inactive' | 'all';

interface CatalogRow {
  type: TreatmentTypeWithUsage;
  flags: boolean[];
  filled: number;
  /** Translation keys of the short names of the empty sections. */
  missingKeys: string[];
}

/**
 * Treatment catalog: one table row per treatment type with how complete its consent text is, how
 * widely it has been used, and whether it is offered for new treatments. Editing happens in
 * {@link TreatmentTypeFormDialogComponent}, which previews the consent as it will print.
 */
@Component({
  selector: 'app-treatment-type-list',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDialogModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="page-head">
      <div class="titles">
        <p class="eyebrow">{{ 'shell.nav.admin' | transloco }}</p>
        <h1>{{ 'treatmentCatalog.title' | transloco }}</h1>
        @if (loaded()) {
          <p class="summary">
            {{ 'treatmentCatalog.summary.active' | transloco: { n: counts().active } }}
            · {{ 'treatmentCatalog.summary.inactive' | transloco: { n: counts().inactive } }}
            @if (counts().incomplete > 0) {
              · {{ 'treatmentCatalog.summary.incomplete' | transloco: { n: counts().incomplete } }}
            }
          </p>
        }
      </div>
      <button
        *appHasPermission="'treatments:create'"
        mat-flat-button
        color="primary"
        class="new-button"
        (click)="openCreate()"
      >
        <mat-icon>add</mat-icon> {{ 'treatmentCatalog.new' | transloco }}
      </button>
    </div>

    @if (rows().length > 0) {
      <div class="toolbar">
        <label class="search">
          <mat-icon aria-hidden="true">search</mat-icon>
          <input
            type="search"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            [placeholder]="'treatmentCatalog.searchPlaceholder' | transloco"
            [attr.aria-label]="'treatmentCatalog.searchPlaceholder' | transloco"
          />
        </label>
        <div class="filters" role="group" [attr.aria-label]="'treatmentCatalog.filters.label' | transloco">
          @for (f of filterOptions; track f) {
            <button
              type="button"
              class="filter"
              [class.is-on]="filter() === f"
              [attr.aria-pressed]="filter() === f"
              (click)="filter.set(f)"
            >
              {{ 'treatmentCatalog.filters.' + f | transloco }}
              <span class="count">{{ countFor(f) }}</span>
            </button>
          }
        </div>
      </div>
    }

    @if (loaded() && rows().length === 0) {
      <div class="empty-state">
        <mat-icon>medical_services</mat-icon>
        <p>{{ 'treatments.empty' | transloco }}</p>
      </div>
    } @else if (rows().length > 0) {
      <div class="table-card">
        <table class="catalog">
          <thead>
            <tr>
              <th scope="col">{{ 'treatmentCatalog.columns.treatment' | transloco }}</th>
              <th scope="col">{{ 'treatmentCatalog.columns.consent' | transloco }}</th>
              @if (hasUsage()) {
                <th scope="col">{{ 'treatmentCatalog.columns.usage' | transloco }}</th>
              }
              <th scope="col">{{ 'treatmentCatalog.columns.active' | transloco }}</th>
              <th scope="col"><span class="visually-hidden">{{ 'common.edit' | transloco }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of visibleRows(); track row.type.id) {
              <tr [class.is-inactive]="!row.type.active">
                <td class="cell-name">
                  <span class="type-name">{{ row.type.name }}</span>
                  <span class="sub">
                    @if (!row.type.active) {
                      <span class="inactive-badge">{{ 'treatmentCatalog.inactiveBadge' | transloco }}</span>
                    }
                    {{ 'treatmentCatalog.updated' | transloco: { date: formatDate(row.type.updatedAt) } }}
                  </span>
                </td>
                <td class="cell-consent">
                  <span class="consent-line">
                    <span class="segments" aria-hidden="true">
                      @for (on of row.flags; track $index) {
                        <span class="seg" [class.is-on]="on"></span>
                      }
                    </span>
                    @if (row.filled === sectionCount) {
                      <strong>{{ 'treatmentCatalog.complete' | transloco }}</strong>
                    } @else {
                      <span>{{ 'treatmentCatalog.sectionsCount' | transloco: { n: row.filled, total: sectionCount } }}</span>
                    }
                  </span>
                  <span class="sub">
                    @if (row.missingKeys.length > 0) {
                      {{ 'treatmentCatalog.missing' | transloco }}
                      @for (k of row.missingKeys; track k; let last = $last) {
                        {{ k | transloco }}{{ last ? '' : ', ' }}
                      }
                    } @else {
                      {{ 'treatmentCatalog.allSections' | transloco }}
                    }
                  </span>
                </td>
                @if (hasUsage()) {
                  <td class="cell-usage">
                    @if (row.type.usage; as usage) {
                      @if (usage.patientCount > 0) {
                        <span class="num">
                          {{
                            (usage.patientCount === 1 ? 'treatmentCatalog.patientsOne' : 'treatmentCatalog.patientsMany')
                              | transloco: { n: usage.patientCount }
                          }}
                        </span>
                        @if (usage.lastUsedAt) {
                          <span class="sub">
                            {{ 'treatmentCatalog.lastUsed' | transloco: { date: formatDate(usage.lastUsedAt) } }}
                          </span>
                        }
                      } @else {
                        <span class="sub">{{ 'treatmentCatalog.neverUsed' | transloco }}</span>
                      }
                    }
                  </td>
                }
                <td class="cell-active">
                  @if (canEdit()) {
                    <mat-slide-toggle
                      [checked]="row.type.active"
                      (change)="toggleActive(row.type, $event)"
                      [attr.aria-label]="'treatmentCatalog.activeFor' | transloco: { name: row.type.name }"
                      hideIcon
                    ></mat-slide-toggle>
                  } @else {
                    {{ (row.type.active ? 'common.yes' : 'common.no') | transloco }}
                  }
                </td>
                <td class="cell-edit">
                  <button
                    *appHasPermission="'treatments:edit'"
                    mat-icon-button
                    (click)="openEdit(row.type)"
                    [attr.aria-label]="'treatmentCatalog.editAria' | transloco: { name: row.type.name }"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td class="no-match" [attr.colspan]="hasUsage() ? 5 : 4">
                  {{ 'treatmentCatalog.noMatch' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="footnote">{{ 'treatmentCatalog.footnote' | transloco }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px 24px;
        margin-bottom: 20px;
      }
      .titles {
        flex: 1 1 280px;
        min-width: 0;
      }
      .eyebrow {
        margin: 0 0 2px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      h1 {
        margin: 0;
      }
      .summary {
        margin: 2px 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .new-button {
        min-height: 48px;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .search {
        flex: 1 1 320px;
        display: flex;
        align-items: center;
        gap: 10px;
        height: 48px;
        padding: 0 14px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 10px;
        background: var(--mat-sys-surface-container-lowest);
        box-sizing: border-box;
        color: var(--mat-sys-on-surface-variant);
      }
      .search:focus-within {
        border-color: var(--mat-sys-on-surface);
        box-shadow: inset 0 0 0 1px var(--mat-sys-on-surface);
      }
      .search input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        font: inherit;
        color: var(--mat-sys-on-surface);
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .filter {
        height: 40px;
        padding: 0 14px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 20px;
        background: var(--mat-sys-surface-container-lowest);
        color: var(--mat-sys-on-surface);
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .filter .count {
        margin-left: 4px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .filter.is-on {
        background: var(--mat-sys-on-surface);
        border-color: var(--mat-sys-on-surface);
        color: var(--mat-sys-surface);
      }
      .filter.is-on .count {
        color: inherit;
        opacity: 0.75;
      }
      .filter:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
      .table-card {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius, 14px);
        background: var(--mat-sys-surface-container-lowest);
        overflow: hidden;
      }
      .catalog {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .catalog th {
        padding: 12px 16px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--mat-sys-on-surface-variant);
      }
      .catalog td {
        padding: 14px 16px;
        vertical-align: top;
        border-top: 1px solid var(--plate-line);
      }
      .cell-name {
        min-width: 0;
      }
      .type-name {
        display: block;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .sub {
        display: block;
        margin-top: 2px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .is-inactive .type-name,
      .is-inactive .cell-consent,
      .is-inactive .cell-usage {
        color: var(--mat-sys-on-surface-variant);
      }
      .inactive-badge {
        display: inline-flex;
        align-items: center;
        height: 22px;
        margin-right: 6px;
        padding: 0 8px;
        border-radius: 11px;
        background: var(--mat-sys-surface-container-high);
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .cell-consent {
        width: 280px;
      }
      .consent-line {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .segments {
        display: inline-flex;
        gap: 3px;
      }
      .seg {
        width: 14px;
        height: 6px;
        border-radius: 3px;
        background: var(--plate-line);
      }
      .seg.is-on {
        background: var(--mat-sys-on-surface);
      }
      .cell-usage {
        width: 150px;
        font-variant-numeric: tabular-nums;
      }
      .cell-active {
        width: 90px;
      }
      .cell-edit {
        width: 48px;
        padding: 6px 8px !important;
        text-align: right;
      }
      .no-match {
        padding: 32px 16px !important;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .footnote {
        margin: 14px 2px 0;
        max-width: 70ch;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      /* Narrow screens: each row becomes a stacked card instead of a squeezed table. */
      @media (max-width: 760px) {
        .catalog thead {
          display: none;
        }
        .catalog,
        .catalog tbody {
          display: block;
        }
        .catalog tr {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px 12px;
          padding: 14px 16px;
          border-top: 1px solid var(--plate-line);
        }
        .catalog tbody tr:first-child {
          border-top: 0;
        }
        .catalog td {
          display: block;
          width: auto;
          padding: 0;
          border-top: 0;
        }
        .cell-name {
          grid-column: 1 / 2;
        }
        .cell-active {
          grid-column: 2;
          grid-row: 1;
        }
        .cell-edit {
          grid-column: 3;
          grid-row: 1;
          padding: 0 !important;
        }
        .cell-consent,
        .cell-usage {
          grid-column: 1 / -1;
        }
        .no-match {
          grid-column: 1 / -1;
        }
      }
    `,
  ],
})
export class TreatmentTypeListComponent implements OnInit {
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);

  protected readonly sectionCount = CONSENT_SECTIONS.length;
  protected readonly filterOptions: readonly CatalogFilter[] = ['active', 'incomplete', 'inactive', 'all'];

  protected readonly types = signal<TreatmentTypeWithUsage[]>([]);
  protected readonly loaded = signal(false);
  protected readonly query = signal('');
  protected readonly filter = signal<CatalogFilter>('active');
  protected readonly canEdit = computed(() => this.auth.hasPermission('treatments', 'edit'));

  protected readonly rows = computed<CatalogRow[]>(() =>
    this.types().map((type) => {
      const flags = sectionFlags(type);
      return {
        type,
        flags,
        filled: flags.filter(Boolean).length,
        missingKeys: CONSENT_SECTIONS.filter((_, i) => !flags[i]).map((s) => s.shortKey),
      };
    })
  );

  /** Usage columns appear only when the server could compute them. */
  protected readonly hasUsage = computed(() => this.types().some((t) => t.usage !== undefined));

  protected readonly counts = computed(() => {
    const rows = this.rows();
    return {
      active: rows.filter((r) => r.type.active).length,
      inactive: rows.filter((r) => !r.type.active).length,
      // Inactive types are left out: an unfinished consent only matters for types still offered.
      incomplete: rows.filter((r) => r.type.active && r.filled < this.sectionCount).length,
      all: rows.length,
    };
  });

  protected readonly visibleRows = computed(() => {
    const q = normalize(this.query().trim());
    const f = this.filter();
    return this.rows().filter((r) => {
      if (f === 'active' && !r.type.active) return false;
      if (f === 'inactive' && r.type.active) return false;
      if (f === 'incomplete' && !(r.type.active && r.filled < this.sectionCount)) return false;
      return !q || normalize(r.type.name).includes(q);
    });
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  protected countFor(f: CatalogFilter): number {
    return this.counts()[f];
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  private async refresh(): Promise<void> {
    try {
      this.types.set(await this.treatmentTypesService.listWithUsage());
    } finally {
      this.loaded.set(true);
    }
  }

  openCreate(): void {
    this.openDialog({ treatmentType: null });
  }

  openEdit(type: TreatmentTypeWithUsage): void {
    this.openDialog({ treatmentType: type, usage: type.usage ?? null });
  }

  private openDialog(data: TreatmentTypeFormDialogData): void {
    const ref = this.dialog.open(TreatmentTypeFormDialogComponent, {
      data,
      width: '1120px',
      maxWidth: '96vw',
      maxHeight: '94dvh',
      autoFocus: false,
      disableClose: true,
      panelClass: 'treatment-type-dialog-panel',
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) void this.refresh();
    });
  }

  async toggleActive(type: TreatmentTypeWithUsage, event: MatSlideToggleChange): Promise<void> {
    try {
      await this.treatmentTypesService.update(type.id, { active: event.checked });
      // Patch in place so the row keeps its usage and the list doesn't jump while filtering.
      this.types.update((list) =>
        list.map((t) => (t.id === type.id ? { ...t, active: event.checked } : t))
      );
    } catch {
      // The signal's stored value for this item never changed on failure, so Angular's
      // one-way [checked] binding won't revert the control on its own — do it explicitly.
      event.source.checked = type.active;
    }
  }
}

/** Case- and accent-insensitive matching, so "acido" finds "Ácido hialurónico". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
