import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { TranslocoModule } from '@jsverse/transloco';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientsService } from './patients.service';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from './active-patient.store';

@Component({
  selector: 'app-patient-search',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    RouterLink,
    HasPermissionDirective,
    TranslocoModule,
  ],
  template: `
    <h1>{{ 'patientDrive.title' | transloco }}</h1>

    <!-- Landing here with a patient already selected used to look like nothing was loaded: the
         search box is empty and the record lives on another route. This offers the way back. -->
    @if (activePatient.patient(); as current) {
      <a
        *appHasPermission="'historia-clinica:view'"
        class="active-patient-card"
        routerLink="/historia-clinica"
      >
        <mat-icon aria-hidden="true">folder_shared</mat-icon>
        <span class="active-patient-text">
          <span class="active-patient-label">{{ 'patientDrive.continueWith' | transloco }}</span>
          <span class="active-patient-name">{{ current.fullName }}</span>
        </span>
        <mat-icon aria-hidden="true">chevron_right</mat-icon>
      </a>
    }
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>{{ 'patientDrive.search' | transloco }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input
        matInput
        [(ngModel)]="query"
        (ngModelChange)="onQueryChange($event)"
        (keydown.enter)="onEnter()"
      />
    </mat-form-field>

    <mat-list>
      @for (patient of results(); track patient.id) {
        <mat-list-item (click)="selectPatient(patient)" class="clickable">
          <mat-icon matListItemIcon>person</mat-icon>
          <span matListItemTitle>{{ patient.fullName }}</span>
          <span matListItemLine>{{ patient.phone }} · {{ patient.documentId }}</span>
        </mat-list-item>
      }
    </mat-list>

    <mat-expansion-panel class="create-panel">
      <mat-expansion-panel-header>
        <mat-panel-title>
          <mat-icon class="panel-icon">person_add</mat-icon>
          {{ 'patientDrive.newPatient' | transloco }}
        </mat-panel-title>
      </mat-expansion-panel-header>
      <form [formGroup]="createForm" (ngSubmit)="createPatient()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'patientDrive.fullName' | transloco }}</mat-label>
          <input matInput formControlName="fullName" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'patientDrive.phone' | transloco }}</mat-label>
          <input matInput formControlName="phone" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'patientDrive.documentId' | transloco }}</mat-label>
          <input matInput formControlName="documentId" />
        </mat-form-field>
        <button mat-flat-button color="primary" type="submit" [disabled]="createForm.invalid">
          {{ 'patientDrive.create' | transloco }}
        </button>
      </form>
    </mat-expansion-panel>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .clickable {
        cursor: pointer;
        border-radius: 8px;
        transition: background-color 150ms ease-out;
      }
      .clickable:hover {
        background-color: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
      }
      .create-panel {
        margin-top: 24px;
      }
      .active-patient-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        margin-bottom: 20px;
        border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        border-radius: 12px;
        background: var(--mat-sys-surface-container-low, transparent);
        color: var(--mat-sys-on-surface);
        text-decoration: none;
        transition: background-color 150ms ease-out, border-color 150ms ease-out;
      }
      .active-patient-card:hover {
        background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
        border-color: var(--mat-sys-primary);
      }
      .active-patient-card mat-icon {
        color: var(--mat-sys-primary);
      }
      .active-patient-text {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
      }
      .active-patient-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .active-patient-name {
        font-weight: 600;
      }
      .panel-icon {
        margin-right: 8px;
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class PatientSearchComponent {
  private readonly patientsService = inject(PatientsService);
  protected readonly activePatient = inject(ActivePatientStore);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected query = '';
  protected readonly results = signal<PatientSummary[]>([]);

  protected readonly createForm = this.fb.group({
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    documentId: ['', Validators.required],
  });

  // Tracks the most recent search so a slower earlier response can't overwrite a newer one. This
  // matters more than it looks: pressing Enter selects whatever is first in `results()`, so stale
  // results landing last would open the wrong patient's record.
  private searchSequence = 0;
  private latestSearch: Promise<void> = Promise.resolve();

  async onQueryChange(value: string): Promise<void> {
    this.query = value;
    const sequence = ++this.searchSequence;
    this.latestSearch = this.patientsService.search(value).then((patients) => {
      if (sequence === this.searchSequence) {
        this.results.set(patients);
      }
    });
    await this.latestSearch;
  }

  /**
   * Enter opens the first match. Typing and hitting Enter straight away is faster than the search
   * round-trip, so wait for the in-flight request rather than acting on the previous query's
   * results — otherwise the shortcut would open whichever patient happened to still be listed.
   */
  protected async onEnter(): Promise<void> {
    await this.latestSearch;
    const first = this.results()[0];
    if (first) this.selectPatient(first);
  }

  selectPatient(patient: PatientSummary): void {
    this.activePatient.select(patient);
    this.router.navigate(['/historia-clinica']);
  }

  async createPatient(): Promise<void> {
    if (this.createForm.invalid) return;
    const value = this.createForm.value;
    const patient = await this.patientsService.create({
      fullName: value.fullName ?? '',
      phone: value.phone ?? '',
      documentId: value.documentId ?? '',
    });
    this.activePatient.select(patient);
    this.createForm.reset();
    this.router.navigate(['/historia-clinica']);
  }
}
