import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type {
  HistoriaClinica,
  PatientSummary,
  PatientSummaryStats,
  PatientTimeline,
  TimelineEvent,
} from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import {
  AppointmentFormComponent,
  type AppointmentFormDialogData,
} from '../appointments/appointment-form.component';
import { HistoriaClinicaService } from '../historia-clinica/historia-clinica.service';
import { ValoracionService } from '../valoracion/valoracion.service';
import { ActivePatientStore } from './active-patient.store';
import { DeletePatientDialogComponent } from './delete-patient-dialog.component';
import {
  NotificationContactDialogComponent,
  type NotificationContactDialogData,
} from './notification-contact-dialog.component';
import { PatientsService } from './patients.service';

type TimelineFilter = 'all' | 'appointment' | 'valoracion' | 'treatment' | 'photos';

/** The four historia clínica steps and the fields each one holds, for the progress list. */
const HISTORIA_STEPS: { key: string; fields: (keyof HistoriaClinica)[] }[] = [
  {
    key: 'personalInfo',
    fields: ['ocupacion', 'fechaNacimiento', 'sexo', 'queQuiereElPaciente', 'queNecesitaElPaciente', 'atributosEmocionales'],
  },
  {
    key: 'medicalInfo',
    fields: ['enfermedadesActuales', 'medicamentosAcne3Meses', 'cirugiasEsteticasAnteriores', 'rutinaCuidadoFacial'],
  },
  {
    key: 'personalHistory',
    fields: ['consumoAlcohol', 'consumoTabaco', 'consumoDrogas', 'tipoFrecuenciaEjercicio', 'vacunas', 'posibilidadEmbarazo'],
  },
  { key: 'familyHistory', fields: ['antecedentesHeredofamiliares'] },
];

/**
 * The patient's landing screen, replacing the old tab bar. Left: the clinical card — what must be
 * known before treating (allergies, pregnancy, conditions) first, then the historia clínica's
 * progress. Right: one timeline of appointments, valoraciones and treatments, filterable, so the
 * history reads in one place instead of across tabs.
 */
@Component({
  selector: 'app-patient-overview',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatDialogModule, MatIconModule, MatMenuModule, TranslocoModule, HasPermissionDirective],
  template: `
    @if (patient(); as p) {
      <header class="head">
        <span class="avatar" aria-hidden="true">{{ initials(p.fullName) }}</span>
        <div class="id">
          <h1>{{ p.fullName }}</h1>
          <p>{{ identityLine() }}</p>
          @if (fullPatient()?.contactPatient; as c) {
            <p class="companion">
              <mat-icon aria-hidden="true">group</mat-icon>
              {{ 'companions.noticesVia' | transloco: { name: c.fullName, phone: c.phone } }}
            </p>
          }
          @if (fullPatient()?.dependents?.length) {
            <p class="companion">
              <mat-icon aria-hidden="true">group</mat-icon>
              {{ 'companions.receivesFor' | transloco: { names: dependentNames() } }}
            </p>
          }
        </div>
        <div class="actions">
          <a *appHasPermission="'export:view'" mat-stroked-button routerLink="../export">
            <mat-icon>picture_as_pdf</mat-icon>{{ 'patientOverview.export' | transloco }}
          </a>
          <button *appHasPermission="'appointments:create'" mat-stroked-button type="button" (click)="schedule()">
            <mat-icon>event_available</mat-icon>{{ 'historiaClinica.scheduleAppointment' | transloco }}
          </button>
          @if (canCreateValoracion || canViewTreatments) {
            <button mat-flat-button color="primary" type="button" [matMenuTriggerFor]="addMenu">
              <mat-icon>add</mat-icon>{{ 'patientOverview.register' | transloco }}
            </button>
            <mat-menu #addMenu="matMenu">
              @if (canCreateValoracion) {
                <button mat-menu-item type="button" (click)="startValoracion()">
                  <mat-icon>face</mat-icon>{{ 'patientOverview.newValoracion' | transloco }}
                </button>
              }
              @if (canViewTreatments) {
                <a mat-menu-item routerLink="../treatments">
                  <mat-icon>vaccines</mat-icon>{{ 'patientOverview.newTreatment' | transloco }}
                </a>
              }
            </mat-menu>
          }
          @if (canDelete || canEditPatient) {
            <button mat-icon-button type="button" [matMenuTriggerFor]="moreMenu" [attr.aria-label]="'patientOverview.more' | transloco">
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #moreMenu="matMenu">
              @if (canEditPatient) {
                <button mat-menu-item type="button" (click)="editNotices()">
                  <mat-icon>group</mat-icon>{{ 'companions.dialogTitle' | transloco }}
                </button>
              }
              @if (canDelete) {
                <button mat-menu-item type="button" class="danger" (click)="deletePatient()">
                  <mat-icon>delete</mat-icon>{{ 'patientDrive.delete.action' | transloco }}
                </button>
              }
            </mat-menu>
          }
        </div>
      </header>

      <div class="body">
        <aside class="card-col" [attr.aria-label]="'patientOverview.cardLabel' | transloco">
          @if (canViewHistoria) {
            @if (historiaLoaded()) {
              <section class="safety" [class.is-empty]="!historia()">
                <h2>
                  <mat-icon aria-hidden="true">warning</mat-icon>{{ 'patientOverview.beforeTreating' | transloco }}
                </h2>
                @if (historia(); as h) {
                  <dl>
                    <dt>{{ 'historiaClinica.fields.alergias' | transloco }}</dt>
                    <dd [class.is-alert]="h.allergies.length > 0">
                      {{ allergyList(h) || ('patientOverview.noneRecorded' | transloco) }}
                    </dd>
                    <dt>{{ 'patientOverview.pregnancy' | transloco }}</dt>
                    <dd>{{ pregnancyLabel(h.posibilidadEmbarazo) }}</dd>
                    <dt>{{ 'historiaClinica.fields.enfermedadesActuales' | transloco }}</dt>
                    <dd>{{ h.enfermedadesActuales || ('patientOverview.notRecorded' | transloco) }}</dd>
                    <dt>{{ 'patientOverview.acne' | transloco }}</dt>
                    <dd>{{ h.medicamentosAcne3Meses || ('patientOverview.notRecorded' | transloco) }}</dd>
                    <dt>{{ 'patientOverview.previousAesthetic' | transloco }}</dt>
                    <dd>{{ h.cirugiasEsteticasAnteriores || ('patientOverview.notRecorded' | transloco) }}</dd>
                  </dl>
                } @else {
                  <p>{{ 'patientOverview.noHistoria' | transloco }}</p>
                }
              </section>

              <section class="plate">
                <div class="plate-head">
                  <h2>{{ 'historiaClinica.title' | transloco }}</h2>
                  <a
                    *appHasPermission="historia() ? 'historia-clinica:edit' : 'historia-clinica:create'"
                    mat-stroked-button
                    routerLink="../historia-clinica"
                  >
                    {{ (historia() ? 'patientOverview.edit' : 'patientOverview.start') | transloco }}
                  </a>
                </div>
                @if (historia()?.queQuiereElPaciente || historia()?.queNecesitaElPaciente) {
                  <div class="motivo">
                    <p class="eyebrow">{{ 'patientOverview.reason' | transloco }}</p>
                    @if (historia()?.queQuiereElPaciente; as want) {
                      <p>{{ want }}</p>
                    }
                    @if (historia()?.queNecesitaElPaciente; as need) {
                      <p class="muted">{{ 'historiaClinica.fields.queNecesitaElPaciente' | transloco }}: {{ need }}</p>
                    }
                  </div>
                }
                @for (step of steps(); track step.key; let i = $index) {
                  <a class="row" routerLink="../historia-clinica" [queryParams]="{ paso: i + 1 }">
                    <span class="grow">{{ 'historiaClinica.sections.' + step.key | transloco }}</span>
                    <span class="progress" [class.is-done]="step.filled === step.total">
                      @if (step.filled === step.total) {
                        <mat-icon aria-hidden="true">check</mat-icon>
                        <span class="visually-hidden">{{ 'patientOverview.complete' | transloco }}</span>
                      } @else if (step.filled === 0) {
                        {{ 'patientOverview.notRecordedShort' | transloco }}
                      } @else {
                        {{ 'patientOverview.partial' | transloco: { filled: step.filled, total: step.total } }}
                      }
                    </span>
                  </a>
                }
              </section>
            }
          }

          @if (summary(); as s) {
            <section class="tiles">
              <a *appHasPermission="'valoracion:view'" class="tile" routerLink="../valoracion">
                <span class="tile-label">{{ 'historiaClinica.summary.valoraciones' | transloco }}</span>
                <span class="tile-value">{{ s.valoraciones.count }}</span>
              </a>
              <a *appHasPermission="'treatments:view'" class="tile" routerLink="../treatments">
                <span class="tile-label">{{ 'historiaClinica.summary.treatments' | transloco }}</span>
                <span class="tile-value">{{ s.treatments.count }}</span>
              </a>
              <a *appHasPermission="'valoracion:view'" class="tile" routerLink="../photos">
                <span class="tile-label">{{ 'workspace.tabs.photos' | transloco }}</span>
                <span class="tile-value">{{ s.photos.count }}</span>
              </a>
              @if (timeline()?.included?.treatments) {
                <button type="button" class="tile" (click)="filter.set('treatment')">
                  <span class="tile-label">{{ 'patientOverview.consents' | transloco }}</span>
                  <span class="tile-value">{{ consentCount() }}</span>
                </button>
              }
            </section>
          }
        </aside>

        <section class="timeline-col" [attr.aria-label]="'patientOverview.timeline' | transloco">
          <div class="tl-head">
            <h2>{{ 'patientOverview.timeline' | transloco }}</h2>
            <div class="filters" role="group" [attr.aria-label]="'patientOverview.filterLabel' | transloco">
              @for (f of filters(); track f) {
                <button
                  type="button"
                  class="filter"
                  [class.is-active]="filter() === f"
                  [attr.aria-pressed]="filter() === f"
                  (click)="filter.set(f)"
                >
                  {{ 'patientOverview.filter.' + f | transloco }}
                </button>
              }
            </div>
          </div>

          @if (timelineFailed()) {
            <div class="empty">
              <p>{{ 'patientOverview.timelineFailed' | transloco }}</p>
              <button mat-stroked-button type="button" (click)="loadTimeline()">{{ 'today.desk.retry' | transloco }}</button>
            </div>
          } @else if (!timeline()) {
            <p class="muted">{{ 'common.loading' | transloco }}</p>
          } @else if (visibleEvents().length === 0) {
            <div class="empty"><p>{{ 'patientOverview.timelineEmpty' | transloco }}</p></div>
          } @else {
            <ol class="timeline">
              @for (e of visibleEvents(); track e.kind + e.id) {
                <li [class]="'ev ev-' + e.kind" [class.is-today]="isTodayAppt(e)">
                  <span class="node" aria-hidden="true"></span>
                  @switch (e.kind) {
                    @case ('appointment') {
                      <div class="card" [class.is-marked]="isTodayAppt(e)">
                        <div class="card-main">
                          <p class="eyebrow">{{ eventDate(e.date, true) }} · {{ 'patientOverview.kind.appointment' | transloco }}</p>
                          <h3>{{ e.treatmentTypeNames.join(', ') || ('patientOverview.appointmentNoTreatment' | transloco) }}</h3>
                          <p class="muted">{{ 'appointments.status.' + e.status | transloco }}</p>
                        </div>
                        @if (isTodayAppt(e) && canCreateValoracion) {
                          <button mat-flat-button color="primary" type="button" (click)="startValoracion()">
                            {{ 'patientOverview.startValoracion' | transloco }}
                          </button>
                        }
                      </div>
                    }
                    @case ('valoracion') {
                      <article class="card">
                        <div class="card-main">
                          <p class="eyebrow">{{ eventDate(e.date) }} · {{ 'patientOverview.kind.valoracion' | transloco }}</p>
                          <h3>{{ 'patientOverview.valoracionTitle' | transloco: { views: e.viewCount, photos: e.photoCount } }}</h3>
                          @if (e.notes) {
                            <p class="muted clamp">{{ e.notes }}</p>
                          }
                          @if (e.photos.length > 0) {
                            <div class="thumbs">
                              @for (ph of e.photos; track ph.path) {
                                <img [src]="fileUrl(ph.path)" [alt]="'patientOverview.photoAlt.' + ph.tag | transloco" loading="lazy" />
                              }
                            </div>
                          }
                        </div>
                        <a mat-button [routerLink]="['../valoracion', e.id]">{{ 'patientOverview.open' | transloco }}</a>
                      </article>
                    }
                    @case ('treatment') {
                      <article class="card">
                        <div class="card-main">
                          <p class="eyebrow">{{ eventDate(e.date) }} · {{ 'patientOverview.kind.treatment' | transloco }}</p>
                          @for (item of e.items; track item.id) {
                            <h3>{{ item.treatmentTypeName }}</h3>
                            <dl>
                              @if (item.products.length > 0) {
                                <dt>{{ 'patientDrive.browse.productLot' | transloco }}</dt>
                                <dd class="tabular">
                                  @for (prod of item.products; track $index) {
                                    <span class="block">
                                      {{ prod.brand }} · {{ 'patientDrive.browse.lot' | transloco }} {{ prod.lotNumber }}
                                      @if (prod.expiryDate) {
                                        · {{ 'patientDrive.browse.expiry' | transloco }} {{ monthYear(prod.expiryDate) }}
                                      }
                                    </span>
                                  }
                                </dd>
                              }
                              <dt>{{ 'patientDrive.browse.consent' | transloco }}</dt>
                              <dd [class.is-warning]="item.consent === 'missing'">
                                {{ 'patientDrive.browse.consentState.' + item.consent | transloco }}
                              </dd>
                            </dl>
                            @if (item.photos.length > 0) {
                              <div class="thumbs">
                                @for (ph of item.photos; track ph.path) {
                                  <img [src]="fileUrl(ph.path)" [alt]="'patientOverview.photoAlt.' + ph.tag | transloco" loading="lazy" />
                                }
                              </div>
                            }
                          } @empty {
                            <h3>{{ 'patientOverview.treatmentEmpty' | transloco }}</h3>
                          }
                        </div>
                        <a mat-button [routerLink]="['../treatments', e.id]">{{ 'patientOverview.open' | transloco }}</a>
                      </article>
                    }
                    @case ('created') {
                      <p class="created">{{ 'patientOverview.created' | transloco: { date: eventDate(e.date) } }}</p>
                    }
                  }
                </li>
              }
            </ol>
          }
        </section>
      </div>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 16px 20px;
        margin-bottom: 24px;
      }
      .avatar {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 1px solid var(--plate-line);
        background: var(--mat-sys-surface-container-low);
        font-size: 20px;
        font-weight: 600;
        color: var(--mat-sys-on-surface-variant);
      }
      .id {
        flex: 1 1 280px;
        min-width: 0;
      }
      .id h1 {
        margin: 0;
      }
      .id p {
        margin: 2px 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .companion {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .companion mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .danger {
        color: var(--mat-sys-error);
      }
      .body {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        align-items: flex-start;
      }
      .card-col {
        flex: 1 1 320px;
        max-width: 420px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      @media (max-width: 939px) {
        .card-col {
          max-width: none;
        }
      }
      .timeline-col {
        flex: 999 1 520px;
        min-width: 0;
      }
      h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }
      .safety {
        padding: 16px 20px;
        border: 1px solid var(--mat-sys-error);
        border-radius: 14px;
        background: var(--mat-sys-surface);
      }
      .safety.is-empty {
        border-style: dashed;
        border-color: var(--plate-line-strong);
      }
      .safety h2 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-error);
      }
      .safety.is-empty h2 {
        color: var(--mat-sys-on-surface-variant);
      }
      .safety h2 mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .safety p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px 14px;
        margin: 0;
        font-size: 13px;
      }
      dt {
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      dd.is-alert {
        color: var(--mat-sys-error);
        font-weight: 600;
      }
      dd.is-warning {
        font-weight: 600;
      }
      .plate {
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        overflow: hidden;
      }
      .plate-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--plate-line);
      }
      .motivo {
        padding: 14px 20px;
        border-bottom: 1px solid var(--plate-line);
      }
      .motivo p {
        margin: 2px 0 0;
      }
      .eyebrow {
        margin: 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-variant-numeric: tabular-nums;
      }
      .muted {
        margin: 2px 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 52px;
        padding: 0 20px;
        color: inherit;
        text-decoration: none;
        transition: background-color 150ms ease-out;
      }
      .row + .row {
        border-top: 1px solid var(--plate-line);
      }
      .row:hover,
      .row:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .grow {
        flex: 1;
      }
      .progress {
        display: inline-flex;
        align-items: center;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .progress.is-done {
        color: var(--mat-sys-on-surface);
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .tile {
        display: flex;
        flex-direction: column;
        min-height: 56px;
        padding: 14px 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        color: inherit;
        font: inherit;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }
      .tile:hover,
      .tile:focus-visible {
        border-color: var(--plate-line-strong);
        background: var(--mat-sys-surface-container-low);
      }
      .tile-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .tile-value {
        font-size: 1.5rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .tl-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .tl-head h2 {
        font-size: 1.25rem;
        letter-spacing: -0.015em;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .filter {
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 20px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .filter.is-active {
        border-color: transparent;
        background: var(--mat-sys-inverse-surface);
        color: var(--mat-sys-inverse-on-surface);
      }
      .timeline {
        list-style: none;
        margin: 0;
        padding: 0 0 0 28px;
        border-left: 1px solid var(--plate-line);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .ev {
        position: relative;
      }
      .node {
        position: absolute;
        left: -34px;
        top: 18px;
        width: 11px;
        height: 11px;
        border-radius: 50%;
        box-sizing: border-box;
        background: var(--mat-sys-on-surface-variant);
        border: 3px solid var(--mat-sys-surface-container-lowest, var(--mat-sys-surface));
      }
      .ev-valoracion .node {
        background: var(--mat-sys-surface);
        border: 2px solid var(--mat-sys-on-surface-variant);
      }
      .ev-created .node {
        top: 12px;
        background: var(--mat-sys-surface);
        border: 2px solid var(--plate-line-strong);
      }
      .ev.is-today .node {
        background: var(--plate-mark);
      }
      .card {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 20px;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
      }
      .card.is-marked {
        align-items: center;
        border: 1.5px solid var(--plate-mark);
      }
      .card.is-marked .eyebrow {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .card-main {
        flex: 1 1 260px;
        min-width: 0;
      }
      .card h3 {
        margin: 2px 0 6px;
        font-size: 1rem;
        font-weight: 600;
      }
      .card dl + h3 {
        margin-top: 14px;
      }
      .clamp {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .thumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .thumbs img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid var(--plate-line);
        background: var(--mat-sys-surface-container-low);
      }
      .tabular {
        font-variant-numeric: tabular-nums;
      }
      .block {
        display: block;
      }
      .created {
        margin: 0;
        padding: 6px 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        padding: 24px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty p {
        margin: 0;
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
export class PatientOverviewComponent implements OnInit {
  private readonly activePatient = inject(ActivePatientStore);
  private readonly patientsService = inject(PatientsService);
  private readonly historiaService = inject(HistoriaClinicaService);
  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly patient = this.activePatient.patient;
  protected readonly canViewHistoria = this.auth.hasPermission('historia-clinica', 'view');
  protected readonly canCreateValoracion = this.auth.hasPermission('valoracion', 'create');
  protected readonly canViewTreatments = this.auth.hasPermission('treatments', 'view');
  protected readonly canDelete = this.auth.hasPermission('patients', 'delete');
  protected readonly canEditPatient = this.auth.hasPermission('patients', 'edit');
  /** The patient with their companion links, fetched fresh: the store may hold a search result. */
  protected readonly fullPatient = signal<PatientSummary | null>(null);
  protected readonly dependentNames = computed(() =>
    (this.fullPatient()?.dependents ?? []).map((d) => d.fullName).join(', ')
  );

  protected readonly historia = signal<HistoriaClinica | null>(null);
  protected readonly historiaLoaded = signal(false);
  protected readonly summary = signal<PatientSummaryStats | null>(null);
  protected readonly timeline = signal<PatientTimeline | null>(null);
  protected readonly timelineFailed = signal(false);
  protected readonly filter = signal<TimelineFilter>('all');

  protected readonly steps = computed(() => {
    const h = this.historia();
    return HISTORIA_STEPS.map((step) => ({
      key: step.key,
      total: step.fields.length,
      filled: h ? step.fields.filter((f) => String(h[f] ?? '').trim() !== '').length : 0,
    }));
  });

  protected readonly filters = computed<TimelineFilter[]>(() => {
    const included = this.timeline()?.included;
    if (!included) return ['all'];
    return [
      'all',
      ...(included.appointments ? (['appointment'] as const) : []),
      ...(included.valoraciones ? (['valoracion'] as const) : []),
      ...(included.treatments ? (['treatment'] as const) : []),
      ...(included.valoraciones || included.treatments ? (['photos'] as const) : []),
    ];
  });

  protected readonly visibleEvents = computed(() => {
    const events = this.timeline()?.events ?? [];
    const f = this.filter();
    if (f === 'all') return events;
    if (f === 'photos') return events.filter((e) => this.photoCountOf(e) > 0);
    return events.filter((e) => e.kind === f);
  });

  protected readonly consentCount = computed(
    () =>
      (this.timeline()?.events ?? []).reduce(
        (n, e) => n + (e.kind === 'treatment' ? e.items.filter((i) => i.consent !== 'missing').length : 0),
        0
      )
  );

  protected readonly identityLine = computed(() => {
    const p = this.patient();
    if (!p) return '';
    const h = this.historia();
    const bits: string[] = [];
    const age = this.ageOf(h?.fechaNacimiento ?? null);
    if (age !== null) bits.push(this.transloco.translate('patientDrive.browse.age', { age }));
    if (h?.ocupacion) bits.push(h.ocupacion);
    if (p.phone) bits.push(p.phone);
    bits.push(p.documentId ?? this.transloco.translate('patientDrive.browse.noCurp'));
    return bits.join(' · ');
  });

  async ngOnInit(): Promise<void> {
    const p = this.patient();
    if (!p) return;
    void this.loadTimeline();
    void this.patientsService
      .getById(p.id)
      .then((full) => this.fullPatient.set(full))
      .catch(() => this.fullPatient.set(null));
    void this.patientsService
      .getSummary(p.id)
      .then((s) => this.summary.set(s))
      .catch(() => this.summary.set(null));
    if (this.canViewHistoria) {
      try {
        this.historia.set(await this.historiaService.get(p.id));
      } catch (error) {
        console.error('Failed to load historia clínica', error);
      } finally {
        this.historiaLoaded.set(true);
      }
    }
  }

  protected async loadTimeline(): Promise<void> {
    const p = this.patient();
    if (!p) return;
    this.timelineFailed.set(false);
    try {
      this.timeline.set(await this.patientsService.getTimeline(p.id));
    } catch (error) {
      console.error('Failed to load timeline', error);
      this.timelineFailed.set(true);
    }
  }

  protected async startValoracion(): Promise<void> {
    const p = this.patient();
    if (!p) return;
    const valoracion = await this.valoracionService.create(p.id);
    await this.router.navigate(['/pacientes', p.id, 'valoracion', valoracion.id]);
  }

  protected schedule(): void {
    const p = this.patient();
    if (!p) return;
    this.dialog
      .open(AppointmentFormComponent, {
        data: { appointment: null, initialPatientId: p.id, initialPatientName: p.fullName } as AppointmentFormDialogData,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.loadTimeline();
      });
  }

  protected editNotices(): void {
    const p = this.fullPatient() ?? this.patient();
    if (!p) return;
    this.dialog
      .open<NotificationContactDialogComponent, NotificationContactDialogData, PatientSummary>(
        NotificationContactDialogComponent,
        { data: { patient: p }, width: '520px', maxWidth: '95vw' }
      )
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) return;
        this.fullPatient.set(updated);
        this.activePatient.select(updated);
      });
  }

  protected async deletePatient(): Promise<void> {
    const p = this.patient();
    if (!p) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<DeletePatientDialogComponent, { fullName: string }, boolean>(DeletePatientDialogComponent, {
          data: { fullName: p.fullName },
        })
        .afterClosed()
    );
    if (!confirmed) return;
    await this.patientsService.delete(p.id);
    // The active patient no longer exists; drop it so the banner and guarded routes stop pointing
    // at a record the server would answer 404 for.
    this.activePatient.clear();
    await this.router.navigateByUrl('/pacientes');
  }

  // --- helpers ----------------------------------------------------------------------------

  private photoCountOf(e: TimelineEvent): number {
    if (e.kind === 'valoracion') return e.photoCount;
    if (e.kind === 'treatment') return e.items.reduce((n, i) => n + i.photos.length, 0);
    return 0;
  }

  protected isTodayAppt(e: TimelineEvent): boolean {
    return e.kind === 'appointment' && new Date(e.date).toDateString() === new Date().toDateString();
  }

  protected allergyList(h: HistoriaClinica): string {
    return h.allergies.map((a) => a.allergy.name).join(', ');
  }

  protected pregnancyLabel(value: string | null): string {
    switch (value) {
      case 'si':
        return this.transloco.translate('common.yes');
      case 'no':
        return this.transloco.translate('common.no');
      case 'no_aplica':
        return this.transloco.translate('historiaClinica.notApplicable');
      default:
        return this.transloco.translate('patientOverview.notRecorded');
    }
  }

  private ageOf(birth: string | null): number | null {
    if (!birth) return null;
    const d = new Date(`${birth.substring(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
    return age;
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '').slice(0, 2)).toUpperCase();
  }

  protected fileUrl(path: string): string {
    return `/api/files/${path}`;
  }

  protected eventDate(iso: string, withTime = false): string {
    const d = new Date(iso);
    const lang = this.transloco.getActiveLang();
    const today = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (today) {
      return withTime
        ? this.transloco.translate('patientDrive.browse.todayAt', { time })
        : this.transloco.translate('patientOverview.today');
    }
    const date = d.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
    return withTime ? `${date} · ${time}` : date;
  }

  protected monthYear(iso: string): string {
    return new Date(iso).toLocaleDateString(this.transloco.getActiveLang(), {
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
}
