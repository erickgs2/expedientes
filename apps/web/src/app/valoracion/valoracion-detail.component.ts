import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { ValoracionDiagram } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ValoracionService } from './valoracion.service';
import { FacialDiagramViewsComponent } from './facial-diagram/facial-diagram-views.component';

@Component({
  selector: 'app-valoracion-detail',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoModule,
    HasPermissionDirective,
    FacialDiagramViewsComponent,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else {
      <h1>{{ 'valoracion.detailTitle' | transloco }} — {{ patient()?.fullName }}</h1>
      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'valoracion.fields.fecha' | transloco }}</mat-label>
          <input matInput type="date" formControlName="fecha" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'valoracion.fields.queQuiereElPaciente' | transloco }}</mat-label>
          <textarea matInput formControlName="queQuiereElPaciente" rows="3"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'valoracion.fields.queNecesitaElPaciente' | transloco }}</mat-label>
          <textarea matInput formControlName="queNecesitaElPaciente" rows="3"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'valoracion.fields.notas' | transloco }}</mat-label>
          <textarea matInput formControlName="notas" rows="10"></textarea>
        </mat-form-field>
        <button
          *appHasPermission="'valoracion:edit'"
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="saving()"
        >
          {{ 'common.save' | transloco }}
        </button>
      </form>
      <app-facial-diagram-views [valoracionId]="valoracionId" [diagrams]="diagrams" />
    }
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
    `,
  ],
})
export class ValoracionDetailComponent implements OnInit {
  private readonly valoracionService = inject(ValoracionService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected valoracionId = '';
  protected diagrams: ValoracionDiagram[] = [];

  protected readonly form = this.fb.group({
    fecha: [''],
    queQuiereElPaciente: [''],
    queNecesitaElPaciente: [''],
    notas: [''],
  });

  async ngOnInit(): Promise<void> {
    this.valoracionId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.valoracionId) {
      this.loading.set(false);
      return;
    }
    // Set when we redirect away on a patient mismatch, so `finally` leaves the loading state up for
    // the real duration of the navigation (guards re-run and a lazy chunk loads) instead of briefly
    // rendering the form and diagram bound to the wrong patient's visit.
    let mismatched = false;
    try {
      const valoracion = await this.valoracionService.get(this.valoracionId);
      // `activePatientGuard` only proves *some* patient is active, not that it's this visit's
      // patient — reaching this URL again after switching patients (e.g. browser Back) would
      // otherwise let staff edit patient A's visit while the banner shows patient B. Bail out
      // before the form is ever populated with the mismatched record's data.
      if (valoracion.patientId !== this.patient()?.id) {
        mismatched = true;
        this.router.navigate(['/valoracion']);
        return;
      }
      this.form.patchValue({
        fecha: valoracion.fecha.substring(0, 10),
        queQuiereElPaciente: valoracion.queQuiereElPaciente ?? '',
        queNecesitaElPaciente: valoracion.queNecesitaElPaciente ?? '',
        notas: valoracion.notas ?? '',
      });
      this.diagrams = valoracion.diagrams;
    } finally {
      if (!mismatched) {
        this.loading.set(false);
      }
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.form.value;
      await this.valoracionService.update(this.valoracionId, {
        fecha: raw.fecha || undefined,
        queQuiereElPaciente: raw.queQuiereElPaciente?.trim() || null,
        queNecesitaElPaciente: raw.queNecesitaElPaciente?.trim() || null,
        notas: raw.notas?.trim() || null,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
