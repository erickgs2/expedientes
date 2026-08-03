import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { ActivePatientStore } from './active-patient.store';

@Component({
  selector: 'app-patient-banner',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    @if (activePatient.patient(); as patient) {
      <div class="banner">
        <mat-icon class="banner-icon" aria-hidden="true">person</mat-icon>
        <span class="banner-name">{{ patient.fullName }}</span>
        <span class="banner-meta">{{ patient.documentId }}</span>
        <span class="banner-spacer"></span>
        <button
          mat-icon-button
          (click)="activePatient.clear()"
          [attr.aria-label]="'patientDrive.clearActive' | transloco"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }
  `,
  styles: [
    `
      .banner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 16px;
        background: var(--mat-sys-surface-variant, #fce4e8);
        color: var(--mat-sys-on-surface-variant);
        border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      }
      .banner-icon {
        color: var(--mat-sys-primary);
      }
      .banner-name {
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .banner-meta {
        font-size: 13px;
      }
      .banner-spacer {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class PatientBannerComponent {
  protected readonly activePatient = inject(ActivePatientStore);
}
