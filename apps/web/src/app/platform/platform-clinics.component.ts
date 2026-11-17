import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type {
  ClinicListFilter,
  ClinicListTab,
  PlatformClinicList,
  PlatformClinicRow,
} from '@expedientes/shared-types';
import { PlatformService } from './platform.service';
import { GrantPremiumDialogComponent } from './grant-premium-dialog.component';
import { bytes, shortDate } from './format';

const FILTERS: Array<{ value: ClinicListFilter | ''; label: string }> = [
  { value: '', label: 'Sin filtro' },
  { value: 'expiring7', label: 'Vence en 7 días' },
  { value: 'expiring30', label: 'Vence en 30 días' },
  { value: 'pastDue', label: 'Pago fallido o en gracia' },
  { value: 'inactive30', label: 'Sin actividad en 30 días' },
];

/**
 * Clinics by plan: tabs for all, Free and Premium with their counts; search by clinic or owner;
 * follow-up filters; CSV export; and multiple selection for giving Premium by hand.
 */
@Component({
  selector: 'app-platform-clinics',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h1 class="title">Clínicas</h1>

    <div class="tabs" role="tablist">
      @for (t of tabs; track t.value) {
        <button type="button" role="tab" [attr.aria-selected]="tab() === t.value" [class.on]="tab() === t.value" (click)="setTab(t.value)">
          {{ t.label }} <span class="count">{{ list()?.counts?.[t.value] ?? '' }}</span>
        </button>
      }
    </div>

    <div class="toolbar">
      <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
        <mat-icon matPrefix>search</mat-icon>
        <mat-label>Clínica o correo del propietario</mat-label>
        <input matInput [ngModel]="q()" (ngModelChange)="onSearch($event)" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="filter" subscriptSizing="dynamic">
        <mat-label>Seguimiento</mat-label>
        <mat-select [ngModel]="filter() ?? ''" (ngModelChange)="setFilter($event)">
          @for (f of filters; track f.value) {
            <mat-option [value]="f.value">{{ f.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <span class="spacer"></span>
      <a mat-stroked-button [href]="csvUrl()" download>
        <mat-icon>download</mat-icon> CSV
      </a>
      <button mat-flat-button [disabled]="selected().size === 0" (click)="openGrant()">
        <mat-icon>workspace_premium</mat-icon>
        Dar Premium{{ selected().size ? ' (' + selected().size + ')' : '' }}
      </button>
    </div>

    @if (list(); as data) {
      @if (data.rows.length === 0) {
        <p class="empty">Ninguna clínica coincide. Prueba otra búsqueda o quita el filtro.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="check">
                  <mat-checkbox
                    [checked]="allSelected()"
                    [indeterminate]="selected().size > 0 && !allSelected()"
                    (change)="toggleAll()"
                    aria-label="Seleccionar todas"
                  />
                </th>
                <th>Clínica</th>
                <th>Plan</th>
                <th>Vigente hasta</th>
                <th class="num">Usuarios</th>
                <th class="num">Pacientes</th>
                <th class="num">Fotos y docs</th>
                <th>Última actividad</th>
              </tr>
            </thead>
            <tbody>
              @for (row of data.rows; track row.id) {
                <tr [class.suspended]="row.status === 'SUSPENDED'">
                  <td class="check">
                    <mat-checkbox [checked]="selected().has(row.id)" (change)="toggle(row.id)" [attr.aria-label]="'Seleccionar ' + row.name" />
                  </td>
                  <td>
                    <a [routerLink]="['/plataforma/clinicas', row.id]" class="name">{{ row.name }}</a>
                    <span class="owner">{{ row.ownerEmail ?? 'sin propietario' }}</span>
                  </td>
                  <td>
                    <span class="plan" [class.premium]="row.tier === 'PREMIUM'">{{ planLabel(row) }}</span>
                    @if (row.status === 'SUSPENDED') {
                      <span class="badge">Suspendida</span>
                    }
                  </td>
                  <td class="num">{{ row.tier === 'PREMIUM' ? date(row.premiumUntil) : '—' }}</td>
                  <td class="num">{{ row.users }}</td>
                  <td class="num">{{ row.patients }}</td>
                  <td class="num">{{ size(row.storageBytes) }}</td>
                  <td class="num">{{ date(row.lastActivityAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="table-wrap" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <span class="skeleton" style="height: 20px; margin: 14px 12px"></span>
        }
      </div>
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
        margin: 0 0 16px;
      }
      .tabs {
        display: flex;
        gap: 4px;
        border-bottom: 1px solid var(--plate-line);
        margin-bottom: 16px;
      }
      .tabs button {
        border: 0;
        background: none;
        padding: 10px 14px;
        font: inherit;
        color: var(--mat-sys-on-surface-variant);
        border-bottom: 2px solid transparent;
        cursor: pointer;
      }
      .tabs button.on {
        color: var(--mat-sys-on-surface);
        border-bottom-color: var(--plate-mark);
        font-weight: 600;
      }
      .count {
        font-variant-numeric: tabular-nums;
        color: var(--mat-sys-on-surface-variant);
        font-weight: 400;
        margin-left: 4px;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .search {
        width: 320px;
      }
      .filter {
        width: 220px;
      }
      .spacer {
        flex: 1;
      }
      .table-wrap {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        overflow-x: auto;
        background: var(--mat-sys-surface);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th {
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: var(--mat-sys-on-surface-variant);
        padding: 10px 12px;
        border-bottom: 1px solid var(--plate-line-strong);
        white-space: nowrap;
      }
      td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--plate-line);
        vertical-align: middle;
      }
      tbody tr:last-child td {
        border-bottom: 0;
      }
      tbody tr:hover {
        background: var(--mat-sys-surface-container-low);
      }
      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      th.num {
        text-align: right;
      }
      .check {
        width: 40px;
      }
      .name {
        display: block;
        color: var(--mat-sys-on-surface);
        font-weight: 600;
        text-decoration: none;
      }
      .name:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .owner {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .plan {
        white-space: nowrap;
      }
      .plan.premium {
        font-weight: 600;
      }
      .badge {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 8px;
        border: 1px solid var(--mat-sys-error);
        color: var(--mat-sys-error);
        border-radius: 999px;
        font-size: 11px;
      }
      tr.suspended td {
        color: var(--mat-sys-on-surface-variant);
      }
      .empty {
        padding: 32px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
    `,
  ],
})
export class PlatformClinicsComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs: Array<{ value: ClinicListTab; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'free', label: 'Gratis' },
    { value: 'premium', label: 'Premium' },
  ];
  protected readonly filters = FILTERS;
  protected readonly tab = signal<ClinicListTab>('all');
  protected readonly q = signal('');
  protected readonly filter = signal<ClinicListFilter | null>(null);
  protected readonly list = signal<PlatformClinicList | null>(null);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly size = bytes;
  protected readonly date = shortDate;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly allSelected = computed(() => {
    const rows = this.list()?.rows ?? [];
    return rows.length > 0 && rows.every((r) => this.selected().has(r.id));
  });

  protected readonly csvUrl = computed(() => this.platform.clinicsCsvUrl(this.tab(), this.q(), this.filter()));

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab') as ClinicListTab | null;
    if (tab && ['all', 'free', 'premium'].includes(tab)) this.tab.set(tab);
    void this.load();
  }

  protected planLabel(row: PlatformClinicRow): string {
    if (row.tier === 'FREE') return 'Gratis';
    if (row.source === 'GRANT') return 'Premium · concesión';
    const method = row.paymentMethod === 'OXXO' ? 'OXXO' : 'tarjeta';
    const period = row.interval === 'YEAR' ? 'anual' : 'mensual';
    return `Premium · ${method} ${period}`;
  }

  protected setTab(tab: ClinicListTab): void {
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'all' ? null : tab }, replaceUrl: true });
    void this.load();
  }

  protected setFilter(value: ClinicListFilter | ''): void {
    this.filter.set(value || null);
    void this.load();
  }

  protected onSearch(value: string): void {
    this.q.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
  }

  protected toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    const rows = this.list()?.rows ?? [];
    this.selected.set(this.allSelected() ? new Set() : new Set(rows.map((r) => r.id)));
  }

  protected openGrant(): void {
    const rows = (this.list()?.rows ?? []).filter((r) => this.selected().has(r.id));
    if (rows.length > 100) return;
    this.dialog
      .open(GrantPremiumDialogComponent, { data: rows, width: '560px', maxWidth: '94vw' })
      .afterClosed()
      .subscribe((granted) => {
        if (granted) {
          this.selected.set(new Set());
          void this.load();
        }
      });
  }

  private async load(): Promise<void> {
    this.list.set(await this.platform.clinics(this.tab(), this.q(), this.filter()));
    const visible = new Set(this.list()?.rows.map((r) => r.id));
    this.selected.set(new Set([...this.selected()].filter((id) => visible.has(id))));
  }
}
