import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { Treatment, TreatmentType } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { TreatmentsService } from './treatments.service';
import { TreatmentTypesService } from './treatment-types.service';

interface TreatmentItemForm {
  treatmentTypeId: string;
  name: string;
  active: boolean;
  selected: boolean;
  notes: string;
}

@Component({
  selector: 'app-treatment-detail',
  standalone: true,
  imports: [
    FormsModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.detailTitle' | transloco }} — {{ patient()?.fullName }}</h1>
      <p>{{ 'valoracion.fields.fecha' | transloco }}: {{ fecha().substring(0, 10) }}</p>
      @for (item of items(); track item.treatmentTypeId) {
        <div class="item-row">
          <mat-checkbox
            *appHasPermission="'treatments:edit'"
            [checked]="item.selected"
            (change)="toggleSelected(item, $event.checked)"
          >
            {{ item.name }}
          </mat-checkbox>
          @if (!item.active) {
            <span class="inactive-badge">{{ 'treatmentCatalog.inactiveBadge' | transloco }}</span>
          }
          @if (item.selected) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'treatments.notes' | transloco }}</mat-label>
              <textarea
                matInput
                [(ngModel)]="item.notes"
                [ngModelOptions]="{ standalone: true }"
                rows="3"
              ></textarea>
            </mat-form-field>
          }
        </div>
      }
      <button
        *appHasPermission="'treatments:edit'"
        mat-flat-button
        color="primary"
        [disabled]="saving()"
        (click)="save()"
      >
        {{ 'common.save' | transloco }}
      </button>
    }
  `,
  styles: [
    `
      .item-row {
        margin-bottom: 12px;
      }
      .full-width {
        width: 100%;
      }
      .inactive-badge {
        margin-left: 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
    `,
  ],
})
export class TreatmentDetailComponent implements OnInit {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly fecha = signal('');
  protected readonly items = signal<TreatmentItemForm[]>([]);
  private treatmentId = '';

  async ngOnInit(): Promise<void> {
    this.treatmentId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.treatmentId) {
      this.loadFailed.set(true);
      this.loading.set(false);
      return;
    }
    // Set when we redirect away on a patient mismatch, so `finally` leaves the loading state up
    // for the real duration of the navigation, matching `ValoracionDetailComponent`'s established
    // pattern — never briefly render the wrong patient's treatment data.
    let mismatched = false;
    try {
      const [treatment, treatmentTypes] = await Promise.all([
        this.treatmentsService.get(this.treatmentId),
        this.treatmentTypesService.list(),
      ]);
      if (treatment.patientId !== this.patient()?.id) {
        mismatched = true;
        this.router.navigate(['/treatments']);
        return;
      }
      this.fecha.set(treatment.fecha);
      this.items.set(this.buildItems(treatment, treatmentTypes));
    } catch (error) {
      console.error('Failed to load treatment', error);
      this.loadFailed.set(true);
    } finally {
      if (!mismatched) {
        this.loading.set(false);
      }
    }
  }

  private buildItems(treatment: Treatment, treatmentTypes: TreatmentType[]): TreatmentItemForm[] {
    // Every active type is offered for selection; a type already selected on this treatment
    // before being deactivated elsewhere stays visible too (via the `existingByTypeId.has` check
    // below), so existing data is never silently hidden from view.
    const existingByTypeId = new Map(treatment.items.map((i) => [i.treatmentTypeId, i]));
    const candidateTypes = treatmentTypes.filter(
      (type) => type.active || existingByTypeId.has(type.id)
    );
    return candidateTypes.map((type) => {
      const existing = existingByTypeId.get(type.id);
      return {
        treatmentTypeId: type.id,
        name: type.name,
        active: type.active,
        selected: !!existing,
        notes: existing?.notes ?? '',
      };
    });
  }

  protected toggleSelected(item: TreatmentItemForm, selected: boolean): void {
    this.items.update((current) =>
      current.map((i) => (i.treatmentTypeId === item.treatmentTypeId ? { ...i, selected } : i))
    );
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const selectedItems = this.items()
        .filter((i) => i.selected)
        .map((i) => ({ treatmentTypeId: i.treatmentTypeId, notes: i.notes.trim() || null }));
      await this.treatmentsService.updateItems(this.treatmentId, { items: selectedItems });
    } finally {
      this.saving.set(false);
    }
  }
}
