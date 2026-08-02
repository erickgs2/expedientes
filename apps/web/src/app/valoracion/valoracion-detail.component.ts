import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ValoracionService } from './valoracion.service';

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
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else {
      <h1>{{ 'valoracion.detailTitle' | transloco }}</h1>
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
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  private valoracionId = '';

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
    try {
      const valoracion = await this.valoracionService.get(this.valoracionId);
      this.form.patchValue({
        fecha: valoracion.fecha.substring(0, 10),
        queQuiereElPaciente: valoracion.queQuiereElPaciente ?? '',
        queNecesitaElPaciente: valoracion.queNecesitaElPaciente ?? '',
        notas: valoracion.notas ?? '',
      });
    } finally {
      this.loading.set(false);
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
