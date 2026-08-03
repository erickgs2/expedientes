import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentSummary } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { TreatmentsService } from './treatments.service';

@Component({
  selector: 'app-treatment-list',
  standalone: true,
  imports: [MatListModule, MatButtonModule, TranslocoModule, HasPermissionDirective],
  template: `
    <h1>{{ 'treatments.listTitle' | transloco }} — {{ patient()?.fullName }}</h1>
    <button
      *appHasPermission="'treatments:create'"
      mat-flat-button
      color="primary"
      [disabled]="creating()"
      (click)="createNew()"
    >
      {{ 'treatments.new' | transloco }}
    </button>
    <mat-list>
      @for (t of treatments(); track t.id) {
        <mat-list-item (click)="openDetail(t.id)" class="clickable">
          <span matListItemTitle>{{ t.fecha.substring(0, 10) }}</span>
          <span matListItemLine>
            {{
              t.treatmentTypeNames.length
                ? t.treatmentTypeNames.join(', ')
                : ('treatments.noItems' | transloco)
            }}
          </span>
        </mat-list-item>
      } @empty {
        <p>{{ 'treatments.empty' | transloco }}</p>
      }
    </mat-list>
  `,
  styles: [
    `
      .clickable {
        cursor: pointer;
      }
    `,
  ],
})
export class TreatmentListComponent implements OnInit {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly router = inject(Router);

  protected readonly patient = this.activePatient.patient;
  protected readonly treatments = signal<TreatmentSummary[]>([]);
  protected readonly creating = signal(false);

  async ngOnInit(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;
    this.treatments.set(await this.treatmentsService.list(patient.id));
  }

  async createNew(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;
    this.creating.set(true);
    try {
      const treatment = await this.treatmentsService.create(patient.id);
      this.router.navigate(['/treatments', treatment.id]);
    } finally {
      this.creating.set(false);
    }
  }

  openDetail(id: string): void {
    this.router.navigate(['/treatments', id]);
  }
}
