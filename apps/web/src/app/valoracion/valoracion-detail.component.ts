import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import type { ValoracionDiagram } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ValoracionService } from './valoracion.service';
import { FacialDiagramViewsComponent } from '../shared/facial-diagram/facial-diagram-views.component';
import type { DiagramDataSource } from '../shared/facial-diagram/diagram-data-source';
import { PhotoGalleryComponent } from '../shared/photo/photo-gallery.component';
import type { PhotoDataSource } from '../shared/photo/photo-data-source';

@Component({
  selector: 'app-valoracion-detail',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    TranslocoModule,
    HasPermissionDirective,
    FacialDiagramViewsComponent,
    PhotoGalleryComponent,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <!-- A failed load must never fall through to the record body: the child components below
           fetch and render server data keyed by the valoracionId, and on this path nothing about
           that id has been validated against the active patient. -->
      <p class="load-error">{{ 'common.loadError' | transloco }}</p>
    } @else {
      <a mat-button class="back-link" routerLink="/valoracion">
        <mat-icon>arrow_back</mat-icon>
        {{ 'common.back' | transloco }}
      </a>
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
      <app-facial-diagram-views
        [dataSource]="diagramDataSource"
        permissionModule="valoracion"
        [diagrams]="diagrams"
      />
      <app-photo-gallery [dataSource]="photoDataSource" permissionModule="valoracion" />
    }
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .load-error {
        color: var(--mat-sys-error, #b3261e);
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
  protected readonly loadFailed = signal(false);
  protected valoracionId = '';
  protected patientId = '';
  protected diagrams: ValoracionDiagram[] = [];
  protected diagramDataSource!: DiagramDataSource;
  protected photoDataSource!: PhotoDataSource;

  protected readonly form = this.fb.group({
    fecha: [''],
    queQuiereElPaciente: [''],
    queNecesitaElPaciente: [''],
    notas: [''],
  });

  async ngOnInit(): Promise<void> {
    this.valoracionId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.valoracionId) {
      this.loadFailed.set(true);
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
      this.patientId = this.patient()!.id; // patient() is guaranteed non-null here, per the check above
      this.form.patchValue({
        fecha: valoracion.fecha.substring(0, 10),
        queQuiereElPaciente: valoracion.queQuiereElPaciente ?? '',
        queNecesitaElPaciente: valoracion.queNecesitaElPaciente ?? '',
        notas: valoracion.notas ?? '',
      });
      this.diagrams = valoracion.diagrams;
      this.diagramDataSource = {
        listReferenceOptions: async () => {
          const visits = await this.valoracionService.list(this.patientId);
          // The `patientId` check is defense in depth, not deduplication: `list()` is already
          // patient-scoped server-side, so this filter is a no-op today. It exists so the ids that
          // end up in the picker — and therefore the ids handed to the *unscoped*
          // `GET /api/valoracion/:id` below — can never come from another patient, even if a
          // future change repoints this list at an unscoped source. A wrong-patient leak already
          // shipped once in this project.
          return visits
            .filter((v) => v.id !== this.valoracionId && v.patientId === this.patientId)
            .map((v) => ({ id: v.id, label: v.fecha.substring(0, 10) }));
        },
        getReferenceViews: async (id: string) => {
          const visit = await this.valoracionService.get(id);
          // `GET /api/valoracion/:id` is not patient-scoped server-side. The picker only ever
          // offers ids from this patient's own list, so this cannot trigger today — it asserts
          // that invariant rather than trusting it, and on a mismatch shows nothing at all instead
          // of another patient's data.
          if (visit.patientId !== this.patientId) return [];
          return visit.diagrams;
        },
        save: async (views) => {
          const valoracion = await this.valoracionService.updateDiagrams(this.valoracionId, {
            views,
          });
          return valoracion.diagrams;
        },
      };
      this.photoDataSource = {
        list: () => this.valoracionService.listPhotos(this.valoracionId),
        upload: (blob, tag) => this.valoracionService.uploadPhoto(this.valoracionId, blob, tag),
        delete: (photoId) => this.valoracionService.deletePhoto(this.valoracionId, photoId),
      };
    } catch (error) {
      // A thrown fetch (network blip, 500) leaves the identity check *unperformed*, not passed —
      // on a stale cross-patient URL that would otherwise render the gallery and diagrams for
      // another patient's visit under the active patient's banner. Show the error state instead
      // and leave `diagrams`/the form untouched.
      console.error('Failed to load valoración', error);
      this.loadFailed.set(true);
      // Belt and braces alongside the template gate: the unvalidated id from the route is dropped,
      // so no child binding could carry it even if this state were ever rendered.
      this.valoracionId = '';
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
