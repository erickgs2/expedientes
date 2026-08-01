import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivePatientStore } from './active-patient.store';

@Component({
  selector: 'app-patient-banner',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (activePatient.patient(); as patient) {
      <div class="banner">
        <mat-icon>person</mat-icon>
        <span>{{ patient.fullName }} · {{ patient.documentId }}</span>
        <button mat-icon-button (click)="activePatient.clear()" aria-label="Clear active patient">
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
        gap: 8px;
        padding: 8px 16px;
        background: var(--mat-sys-surface-variant, #fce4e8);
      }
    `,
  ],
})
export class PatientBannerComponent {
  protected readonly activePatient = inject(ActivePatientStore);
}
