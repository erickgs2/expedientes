import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentSummary } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { TreatmentsService } from './treatments.service';

@Component({
  selector: 'app-treatment-list',
  standalone: true,
  imports: [
    MatListModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <a mat-button class="back-link" routerLink="/historia-clinica">
      <mat-icon>arrow_back</mat-icon>
      {{ 'common.backToHistoria' | transloco }}
    </a>
    <div class="page-header">
      <h1>{{ 'treatments.listTitle' | transloco }} — {{ patient()?.fullName }}</h1>
      <div class="page-actions">
        <button
          *appHasPermission="'treatments:create'"
          mat-flat-button
          color="primary"
          [disabled]="creating()"
          (click)="createNew()"
        >
          <mat-icon>add</mat-icon>
          {{ 'treatments.new' | transloco }}
        </button>
      </div>
    </div>
    @if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <mat-list>
        @for (t of treatments(); track t.id) {
          <mat-list-item (click)="openDetail(t.id)" class="clickable">
            <mat-icon matListItemIcon>healing</mat-icon>
            <span matListItemTitle>{{ t.fecha.substring(0, 10) }}</span>
            <span matListItemLine>
              {{
                t.treatmentTypeNames.length
                  ? t.treatmentTypeNames.join(', ')
                  : ('treatments.noItems' | transloco)
              }}
            </span>
            <mat-icon matListItemMeta>chevron_right</mat-icon>
          </mat-list-item>
        } @empty {
          <div class="empty-state">
            <mat-icon>healing</mat-icon>
            <p>{{ 'treatments.empty' | transloco }}</p>
          </div>
        }
      </mat-list>
    }
  `,
  styles: [
    `
      .clickable {
        cursor: pointer;
        border-radius: 8px;
        transition: background-color 150ms ease-out;
      }
      .clickable:hover {
        background-color: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
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
  protected readonly loadFailed = signal(false);

  async ngOnInit(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;
    try {
      this.treatments.set(await this.treatmentsService.list(patient.id));
    } catch (error) {
      console.error('Failed to load treatments', error);
      this.loadFailed.set(true);
    }
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
