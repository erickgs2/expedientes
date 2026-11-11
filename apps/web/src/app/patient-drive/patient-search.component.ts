import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { PatientPreview, PatientSummary } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { AppointmentService } from '../appointments/appointment.service';
import {
  AppointmentFormComponent,
  type AppointmentFormDialogData,
} from '../appointments/appointment-form.component';
import { ActivePatientStore } from './active-patient.store';
import { NewPatientDialogComponent } from './new-patient-dialog.component';
import { PatientsService } from './patients.service';

type ListTab = 'today' | 'recent' | 'all';

/** One row of the left-hand list, whichever source filled it. */
interface ListRow {
  id: string;
  fullName: string;
  /** Second line: treatment, last opened, or phone and CURP. */
  meta: string;
  /** Right-aligned time, for today's appointments. */
  time: string | null;
}

type Section = 'resumen' | 'historia-clinica' | 'valoracion' | 'photos' | 'treatments' | 'export';

/**
 * Patient search with a preview. The list starts filled — today's appointments, the user's recent
 * records, or everyone — so the screen is never empty; typing switches it to search results.
 * Choosing a row shows that patient's summary beside the list, so the right record is confirmed
 * before it is opened; Enter in the search box still opens the first match straight away.
 */
@Component({
  selector: 'app-patient-search',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule, HasPermissionDirective],
  template: `
    <div class="layout">
      <section class="browse" [attr.aria-label]="'patientDrive.browse.listLabel' | transloco">
        <div class="browse-head">
          <h1>{{ 'patientDrive.browse.title' | transloco }}</h1>
          <button
            *appHasPermission="'patients:create'"
            mat-flat-button
            color="primary"
            type="button"
            (click)="newPatient()"
          >
            <mat-icon>person_add</mat-icon>
            {{ 'patientDrive.browse.new' | transloco }}
          </button>
        </div>

        <label class="search">
          <mat-icon aria-hidden="true">search</mat-icon>
          <span class="visually-hidden">{{ 'patientDrive.search' | transloco }}</span>
          <input
            #searchInput
            type="search"
            autocomplete="off"
            [placeholder]="'patientDrive.search' | transloco"
            [ngModel]="query()"
            (ngModelChange)="onQueryChange($event)"
            (keydown.enter)="openFirst()"
          />
        </label>

        @if (!query().trim()) {
          <div class="tabs" role="tablist" [attr.aria-label]="'patientDrive.browse.listsLabel' | transloco">
            @for (t of tabs; track t.value) {
              <button
                type="button"
                role="tab"
                class="tab"
                [class.is-active]="tab() === t.value"
                [attr.aria-selected]="tab() === t.value"
                (click)="setTab(t.value)"
              >
                {{ t.label | transloco }}
              </button>
            }
          </div>
        }

        @if (listLoading()) {
          <p class="note">{{ 'common.loading' | transloco }}</p>
        } @else if (rows().length === 0) {
          <p class="empty">{{ emptyKey() | transloco }}</p>
        } @else {
          <ul class="list" [attr.aria-label]="listLabel() | transloco">
            @for (row of rows(); track row.id) {
              <li>
                <button
                  type="button"
                  class="row"
                  [class.is-selected]="row.id === selectedId()"
                  [attr.aria-current]="row.id === selectedId() ? 'true' : null"
                  (click)="select(row.id)"
                  (dblclick)="openRecord(row.id)"
                >
                  <span class="avatar" aria-hidden="true">{{ initials(row.fullName) }}</span>
                  <span class="row-text">
                    <span class="row-name">{{ row.fullName }}</span>
                    @if (row.meta) {
                      <span class="row-meta">{{ row.meta }}</span>
                    }
                  </span>
                  @if (row.time) {
                    <span class="row-time">{{ row.time }}</span>
                  }
                </button>
              </li>
            }
          </ul>
        }
        <p class="note">{{ 'patientDrive.browse.enterHint' | transloco }}</p>
      </section>

      <section #previewPane class="preview" [attr.aria-label]="'patientDrive.browse.previewLabel' | transloco" aria-live="polite">
        @if (preview(); as p) {
          <header class="p-head">
            <span class="avatar is-large" aria-hidden="true">{{ initials(p.patient.fullName) }}</span>
            <div class="p-id">
              <h2>{{ p.patient.fullName }}</h2>
              <p>{{ identityLine(p) }}</p>
              <p>{{ 'patientDrive.browse.since' | transloco: { date: monthYear(p.patient.createdAt) } }}</p>
            </div>
            <button mat-flat-button color="primary" type="button" (click)="openRecord(p.patient.id)">
              {{ 'patientDrive.browse.open' | transloco }}
            </button>
          </header>

          @if (p.hasAllergies) {
            <p class="alert" role="note">
              <mat-icon aria-hidden="true">warning</mat-icon>
              {{ 'patientDrive.browse.allergy' | transloco }}
            </p>
          }
          @if (p.hasHistoria === false) {
            <div class="notice">
              <span>{{ 'patientDrive.browse.noHistoria' | transloco }}</span>
              <button mat-stroked-button type="button" (click)="goTo('historia-clinica')">
                {{ 'patientDrive.browse.startHistoria' | transloco }}
              </button>
            </div>
          }

          <div class="stats">
            @if (canSeeAppointments) {
              <div class="stat" [class.is-marked]="isToday(p.nextAppointment?.startTime)">
                <span class="stat-label">{{ 'patientDrive.browse.nextAppointment' | transloco }}</span>
                <span class="stat-value">
                  @if (isToday(p.nextAppointment?.startTime)) {
                    <span class="dot" aria-hidden="true"></span>
                  }
                  {{ p.nextAppointment ? when(p.nextAppointment.startTime) : '—' }}
                </span>
                <span class="stat-meta">
                  {{ p.nextAppointment?.treatmentTypeNames?.join(', ') || ('patientDrive.browse.noAppointment' | transloco) }}
                </span>
              </div>
            }
            <div class="stat">
              <span class="stat-label">{{ 'patientDrive.browse.valoraciones' | transloco }}</span>
              <span class="stat-value">{{ p.stats.valoraciones.count }}</span>
              <span class="stat-meta">{{ lastLabel(p.stats.valoraciones.lastDate) }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ 'patientDrive.browse.treatments' | transloco }}</span>
              <span class="stat-value">{{ p.stats.treatments.count }}</span>
              <span class="stat-meta">{{ lastLabel(p.stats.treatments.lastDate) }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">{{ 'patientDrive.browse.photos' | transloco }}</span>
              <span class="stat-value">{{ p.stats.photos.count }}</span>
              <span class="stat-meta">{{ 'patientDrive.browse.photosMeta' | transloco }}</span>
            </div>
          </div>

          @if (p.lastTreatment; as t) {
            <div class="last">
              <h3>{{ 'patientDrive.browse.lastTreatment' | transloco: { date: longDate(t.fecha) } }}</h3>
              @for (item of t.items; track $index) {
                <dl>
                  <dt>{{ 'patientDrive.browse.treatment' | transloco }}</dt>
                  <dd>{{ item.treatmentTypeName }}</dd>
                  @if (item.products.length > 0) {
                    <dt>{{ 'patientDrive.browse.productLot' | transloco }}</dt>
                    <dd class="tabular">
                      @for (prod of item.products; track $index) {
                        <span class="product">
                          {{ prod.brand }} · {{ 'patientDrive.browse.lot' | transloco }} {{ prod.lotNumber }}
                          @if (prod.expiryDate) {
                            · {{ 'patientDrive.browse.expiry' | transloco }} {{ monthYearShort(prod.expiryDate) }}
                          }
                        </span>
                      }
                    </dd>
                  }
                  <dt>{{ 'patientDrive.browse.consent' | transloco }}</dt>
                  <dd>{{ 'patientDrive.browse.consentState.' + item.consent | transloco }}</dd>
                </dl>
              }
            </div>
          }

          <div class="shortcuts">
            <h3>{{ 'patientDrive.browse.goTo' | transloco }}</h3>
            <div class="grid">
              <button *appHasPermission="'historia-clinica:view'" type="button" class="shortcut" (click)="goTo('historia-clinica')">
                <mat-icon aria-hidden="true">description</mat-icon>{{ 'historiaClinica.title' | transloco }}
              </button>
              <button *appHasPermission="'valoracion:view'" type="button" class="shortcut" (click)="goTo('valoracion')">
                <mat-icon aria-hidden="true">face</mat-icon>{{ 'patientDrive.browse.valoraciones' | transloco }}
              </button>
              <button *appHasPermission="'valoracion:view'" type="button" class="shortcut" (click)="goTo('photos')">
                <mat-icon aria-hidden="true">photo_camera</mat-icon>{{ 'patientDrive.browse.photos' | transloco }}
              </button>
              <button *appHasPermission="'treatments:view'" type="button" class="shortcut" (click)="goTo('treatments')">
                <mat-icon aria-hidden="true">vaccines</mat-icon>{{ 'patientDrive.browse.treatments' | transloco }}
              </button>
              <button *appHasPermission="'appointments:create'" type="button" class="shortcut" (click)="schedule(p)">
                <mat-icon aria-hidden="true">event_available</mat-icon>{{ 'historiaClinica.scheduleAppointment' | transloco }}
              </button>
              <button *appHasPermission="'export:view'" type="button" class="shortcut" (click)="goTo('export')">
                <mat-icon aria-hidden="true">picture_as_pdf</mat-icon>{{ 'patientDrive.browse.export' | transloco }}
              </button>
            </div>
          </div>
        } @else if (previewFailed()) {
          <div class="placeholder">
            <p>{{ 'patientDrive.browse.previewFailed' | transloco }}</p>
            <button mat-stroked-button type="button" (click)="reloadPreview()">
              {{ 'today.desk.retry' | transloco }}
            </button>
          </div>
        } @else if (previewLoading()) {
          <div class="placeholder" aria-busy="true">
            <p>{{ 'common.loading' | transloco }}</p>
          </div>
        } @else {
          <div class="placeholder">
            <mat-icon aria-hidden="true">person_search</mat-icon>
            <p>{{ 'patientDrive.browse.pickOne' | transloco }}</p>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .layout {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        align-items: flex-start;
      }
      .browse {
        flex: 1 1 340px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .preview {
        flex: 999 1 560px;
        min-width: 0;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        overflow: hidden;
        scroll-margin-top: 80px;
      }
      .browse-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .browse-head h1 {
        margin: 0;
      }
      .search {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 52px;
        padding: 0 16px;
        border: 1px solid var(--plate-line-strong);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        box-sizing: border-box;
        color: var(--mat-sys-on-surface-variant);
      }
      .search:focus-within {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 1px;
      }
      .search input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        font: inherit;
        font-size: 15px;
        color: var(--mat-sys-on-surface);
      }
      .tabs {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        grid-auto-flow: column;
        border: 1px solid var(--plate-line-strong);
        border-radius: 22px;
        overflow: hidden;
      }
      .tab {
        min-height: 40px;
        border: 0;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .tab + .tab {
        border-left: 1px solid var(--plate-line-strong);
      }
      .tab.is-active {
        background: var(--mat-sys-inverse-surface);
        color: var(--mat-sys-inverse-on-surface);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        overflow: hidden;
      }
      .list li + li {
        border-top: 1px solid var(--plate-line);
      }
      .row {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 64px;
        padding: 10px 16px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color 150ms ease-out;
      }
      .row:hover {
        background: var(--mat-sys-surface-container-low);
      }
      .row.is-selected {
        background: var(--mat-sys-surface-container-low);
        box-shadow: inset 3px 0 0 var(--plate-mark);
      }
      .avatar {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid var(--plate-line);
        background: var(--mat-sys-surface-container-low);
        font-weight: 600;
        color: var(--mat-sys-on-surface-variant);
      }
      .avatar.is-large {
        width: 64px;
        height: 64px;
        font-size: 22px;
      }
      .row-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .row-name {
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .row-meta {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .row-time {
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .note,
      .empty {
        margin: 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty {
        padding: 24px 16px;
        font-size: 14px;
        text-align: center;
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
      .p-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 16px 20px;
        padding: 24px 28px;
        border-bottom: 1px solid var(--plate-line);
      }
      .p-id {
        flex: 1 1 240px;
        min-width: 0;
      }
      .p-id h2 {
        margin: 0;
        font-size: 1.625rem;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.015em;
      }
      .p-id p {
        margin: 2px 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .alert {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 20px 28px 0;
        padding: 10px 14px;
        border: 1px solid var(--mat-sys-error);
        border-radius: var(--plate-radius);
        color: var(--mat-sys-error);
        font-weight: 600;
      }
      .notice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
        margin: 20px 28px 0;
        padding: 10px 14px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
        padding: 20px 28px 8px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        padding: 14px 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
      }
      .stat-label,
      .stat-meta {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .stat-meta {
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .stat-value {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 1.375rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .stat.is-marked .stat-value {
        color: var(--mat-sys-primary);
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .last {
        padding: 12px 28px 4px;
      }
      h3 {
        margin: 0 0 8px;
        font-size: 1rem;
        font-weight: 600;
      }
      dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px 16px;
        margin: 0 0 12px;
        font-size: 13px;
      }
      dt {
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 0;
      }
      .tabular {
        font-variant-numeric: tabular-nums;
      }
      .product {
        display: block;
      }
      .shortcuts {
        padding: 20px 28px 28px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
        gap: 12px;
      }
      .shortcut {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
        padding: 12px 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color 150ms ease-out, background-color 150ms ease-out;
      }
      .shortcut mat-icon {
        color: var(--mat-sys-on-surface-variant);
      }
      .shortcut:hover,
      .shortcut:focus-visible {
        border-color: var(--plate-line-strong);
        background: var(--mat-sys-surface-container-low);
      }
      .shortcut:hover::after,
      .shortcut:focus-visible::after {
        content: '';
        position: absolute;
        right: 14px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 320px;
        padding: 24px;
        color: var(--mat-sys-on-surface-variant);
        text-align: center;
      }
      .placeholder mat-icon {
        width: 40px;
        height: 40px;
        font-size: 40px;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `,
  ],
})
export class PatientSearchComponent implements OnInit {
  private readonly patientsService = inject(PatientsService);
  private readonly appointmentService = inject(AppointmentService);
  protected readonly activePatient = inject(ActivePatientStore);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  @ViewChild('previewPane') private previewPane?: ElementRef<HTMLElement>;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  protected readonly canSeeAppointments = this.auth.hasPermission('appointments', 'view');

  protected readonly tabs: { value: ListTab; label: string }[] = [
    ...(this.canSeeAppointments
      ? [{ value: 'today' as ListTab, label: 'patientDrive.browse.tabToday' }]
      : []),
    { value: 'recent', label: 'patientDrive.browse.tabRecent' },
    { value: 'all', label: 'patientDrive.browse.tabAll' },
  ];

  protected readonly query = signal('');
  protected readonly tab = signal<ListTab>(this.canSeeAppointments ? 'today' : 'recent');
  private readonly tabRows = signal<ListRow[]>([]);
  private readonly searchRows = signal<ListRow[]>([]);
  protected readonly listLoading = signal(true);

  protected readonly rows = computed(() => (this.query().trim() ? this.searchRows() : this.tabRows()));
  protected readonly listLabel = computed(() =>
    this.query().trim() ? 'today.results' : `patientDrive.browse.tab${this.tab()[0].toUpperCase()}${this.tab().slice(1)}`
  );
  protected readonly emptyKey = computed(() =>
    this.query().trim() ? 'today.noResults' : `patientDrive.browse.empty.${this.tab()}`
  );

  protected readonly selectedId = signal<string | null>(null);
  protected readonly preview = signal<PatientPreview | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewFailed = signal(false);

  // Each sequence keeps a slower, older response from overwriting a newer one. For search this
  // matters more than it looks: Enter opens whatever is first, so stale results landing last would
  // open the wrong patient's record.
  private searchSeq = 0;
  private latestSearch: Promise<void> = Promise.resolve();
  private tabSeq = 0;
  private previewSeq = 0;

  async ngOnInit(): Promise<void> {
    await this.loadTab(this.tab());
    // A list with nothing in it today is not a useful first view: fall back to recent records.
    if (this.tab() === 'today' && this.tabRows().length === 0) await this.setTab('recent');

    const preferred = this.activePatient.patient()?.id ?? this.activePatient.restoredPatientId();
    const initial = preferred ?? this.tabRows()[0]?.id ?? null;
    if (initial) void this.select(initial, { scroll: false });
    this.searchInput?.nativeElement.focus();
  }

  protected async setTab(tab: ListTab): Promise<void> {
    this.tab.set(tab);
    await this.loadTab(tab);
  }

  private async loadTab(tab: ListTab): Promise<void> {
    const seq = ++this.tabSeq;
    this.listLoading.set(true);
    try {
      const rows = await this.fetchTab(tab);
      if (seq === this.tabSeq) this.tabRows.set(rows);
    } catch (error) {
      console.error('Failed to load patient list', error);
      if (seq === this.tabSeq) this.tabRows.set([]);
    } finally {
      if (seq === this.tabSeq) this.listLoading.set(false);
    }
  }

  private async fetchTab(tab: ListTab): Promise<ListRow[]> {
    if (tab === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const appointments = await this.appointmentService.list(start, end);
      const seen = new Set<string>();
      return appointments
        .filter((a) => a.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .filter((a) => (seen.has(a.patientId) ? false : (seen.add(a.patientId), true)))
        .map((a) => ({
          id: a.patientId,
          fullName: a.patientName,
          meta: a.treatmentTypeNames.join(', '),
          time: this.time(a.startTime),
        }));
    }
    if (tab === 'recent') {
      const recent = await this.patientsService.recent();
      return recent.map((r) => ({
        id: r.patientId,
        fullName: r.patientName,
        meta: this.transloco.translate('patientDrive.browse.openedAt', { when: this.when(r.viewedAt) }),
        time: null,
      }));
    }
    const all = await this.patientsService.search('');
    return all.map((p) => this.fromSummary(p));
  }

  private fromSummary(p: PatientSummary): ListRow {
    return {
      id: p.id,
      fullName: p.fullName,
      meta:
        (p.phone ||
          (p.contactPatient
            ? this.transloco.translate('companions.via', { name: p.contactPatient.fullName })
            : '')) + (p.documentId ? ` · ${p.documentId}` : ''),
      time: null,
    };
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    const seq = ++this.searchSeq;
    if (!value.trim()) {
      this.searchRows.set([]);
      return;
    }
    this.latestSearch = this.patientsService
      .search(value)
      .then((patients) => {
        if (seq === this.searchSeq) this.searchRows.set(patients.map((p) => this.fromSummary(p)));
      })
      .catch(() => {
        if (seq === this.searchSeq) this.searchRows.set([]);
      });
  }

  /**
   * Enter opens the first match. Typing and hitting Enter straight away is faster than the search
   * round-trip, so wait for the in-flight request rather than acting on the previous query's results.
   */
  protected async openFirst(): Promise<void> {
    await this.latestSearch;
    const first = this.rows()[0];
    if (first) await this.openRecord(first.id);
  }

  protected async select(patientId: string, { scroll = true } = {}): Promise<void> {
    this.selectedId.set(patientId);
    const seq = ++this.previewSeq;
    this.previewLoading.set(true);
    this.previewFailed.set(false);
    this.preview.set(null);
    try {
      const preview = await this.patientsService.getPreview(patientId);
      if (seq !== this.previewSeq) return;
      this.preview.set(preview);
      // Stacked layout (tablet portrait, phone): bring the preview into view after a tap.
      if (scroll && typeof window !== 'undefined' && window.matchMedia('(max-width: 939px)').matches) {
        this.previewPane?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      if (seq !== this.previewSeq) return;
      // A remembered patient deleted since: just show nothing selected.
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.selectedId.set(null);
        return;
      }
      console.error('Failed to load patient preview', error);
      this.previewFailed.set(true);
    } finally {
      if (seq === this.previewSeq) this.previewLoading.set(false);
    }
  }

  protected reloadPreview(): void {
    const id = this.selectedId();
    if (id) void this.select(id, { scroll: false });
  }

  private summaryFor(patientId: string): PatientSummary | null {
    const p = this.preview();
    if (p && p.patient.id === patientId) {
      const { id, fullName, phone, documentId } = p.patient;
      return { id, fullName, phone, documentId };
    }
    return null;
  }

  protected async openRecord(patientId: string): Promise<void> {
    await this.navigateTo(patientId, 'resumen');
  }

  protected async goTo(section: Section): Promise<void> {
    const id = this.selectedId();
    if (id) await this.navigateTo(id, section);
  }

  private async navigateTo(patientId: string, section: Section): Promise<void> {
    // The workspace guard re-fetches the patient when the store is empty, so a summary is a
    // shortcut, not a requirement.
    const summary = this.summaryFor(patientId) ?? (await this.patientsService.getById(patientId));
    this.activePatient.select(summary);
    await this.router.navigate(['/pacientes', patientId, section]);
  }

  protected newPatient(): void {
    this.dialog
      .open<NewPatientDialogComponent, void, PatientSummary>(NewPatientDialogComponent, {
        width: '480px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((patient) => {
        if (!patient) return;
        this.activePatient.select(patient);
        void this.router.navigate(['/pacientes', patient.id, 'historia-clinica']);
      });
  }

  protected schedule(p: PatientPreview): void {
    this.dialog
      .open(AppointmentFormComponent, {
        data: {
          appointment: null,
          initialPatientId: p.patient.id,
          initialPatientName: p.patient.fullName,
          initialStartTime: new Date(),
        } as AppointmentFormDialogData,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.reloadPreview();
      });
  }

  // --- formatting -------------------------------------------------------------------------

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '').slice(0, 2);
    return letters.toUpperCase();
  }

  protected identityLine(p: PatientPreview): string {
    const bits: string[] = [];
    if (p.age !== null) bits.push(this.transloco.translate('patientDrive.browse.age', { age: p.age }));
    if (p.patient.contactPatient) {
      bits.push(this.transloco.translate('companions.via', { name: p.patient.contactPatient.fullName }));
    } else if (p.patient.phone) {
      bits.push(p.patient.phone);
    }
    bits.push(p.patient.documentId ?? this.transloco.translate('patientDrive.browse.noCurp'));
    return bits.join(' · ');
  }

  private get lang(): string {
    return this.transloco.getActiveLang();
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString(this.lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  protected isToday(iso: string | undefined): boolean {
    if (!iso) return false;
    return new Date(iso).toDateString() === new Date().toDateString();
  }

  protected when(iso: string): string {
    if (this.isToday(iso)) {
      return this.transloco.translate('patientDrive.browse.todayAt', { time: this.time(iso) });
    }
    return new Date(iso).toLocaleString(this.lang, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  protected longDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.lang, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected monthYear(iso: string): string {
    return new Date(iso).toLocaleDateString(this.lang, { month: 'long', year: 'numeric' });
  }

  protected monthYearShort(iso: string): string {
    return new Date(iso).toLocaleDateString(this.lang, { month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  }

  protected lastLabel(iso: string | null): string {
    return iso
      ? this.transloco.translate('patientDrive.browse.last', { date: this.longDate(iso) })
      : this.transloco.translate('patientDrive.browse.none');
  }
}
