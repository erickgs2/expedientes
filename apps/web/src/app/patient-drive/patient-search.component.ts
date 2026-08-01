import { Component, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import type { PatientSummary } from '@expedientes/shared-types';
import { PatientsService } from './patients.service';
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
    MatExpansionModule,
  ],
  template: `
    <h1>Patient Drive</h1>
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>Search by name, phone, or ID</mat-label>
      <input matInput [(ngModel)]="query" (ngModelChange)="onQueryChange($event)" />
    </mat-form-field>

    <mat-list>
      @for (patient of results(); track patient.id) {
        <mat-list-item (click)="selectPatient(patient)" class="clickable">
          <span matListItemTitle>{{ patient.fullName }}</span>
          <span matListItemLine>{{ patient.phone }} · {{ patient.documentId }}</span>
        </mat-list-item>
      }
    </mat-list>

    <mat-expansion-panel>
      <mat-expansion-panel-header>
        <mat-panel-title>New patient</mat-panel-title>
      </mat-expansion-panel-header>
      <form [formGroup]="createForm" (ngSubmit)="createPatient()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Full name</mat-label>
          <input matInput formControlName="fullName" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Phone</mat-label>
          <input matInput formControlName="phone" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Document ID</mat-label>
          <input matInput formControlName="documentId" />
        </mat-form-field>
        <button mat-flat-button color="primary" type="submit" [disabled]="createForm.invalid">
          Create patient
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
      }
    `,
  ],
})
export class PatientSearchComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly fb = inject(FormBuilder);

  protected query = '';
  protected readonly results = signal<PatientSummary[]>([]);

  protected readonly createForm = this.fb.group({
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    documentId: ['', Validators.required],
  });

  async onQueryChange(value: string): Promise<void> {
    this.query = value;
    this.results.set(await this.patientsService.search(value));
  }

  selectPatient(patient: PatientSummary): void {
    this.activePatient.select(patient);
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
  }
}
