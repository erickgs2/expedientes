import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from './active-patient.store';

@Component({
  selector: 'app-patient-banner',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslocoModule, HasPermissionDirective],
  template: `
    @if (activePatient.patient(); as patient) {
      <div class="banner">
        <!--
          The selected patient stays visible on every screen, but until this was a link there was
          no way back to their record: the top nav's "Pacientes" opens the patient *search*, so
          after a detour through Exportar or Calendario the record was unreachable without
          re-searching. Tapping the banner returns to it.
        -->
        <a
          *appHasPermission="'historia-clinica:view'"
          class="banner-link"
          routerLink="/historia-clinica"
          [attr.aria-label]="'patientDrive.openRecord' | transloco"
        >
          <mat-icon class="banner-icon" aria-hidden="true">person</mat-icon>
          <span class="banner-name">{{ patient.fullName }}</span>
          @if (patient.documentId) {
            <span class="banner-meta">{{ patient.documentId }}</span>
          }
          <mat-icon class="banner-chevron" aria-hidden="true">chevron_right</mat-icon>
        </a>
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
      .banner-link {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        padding: 0 8px 0 0;
        color: inherit;
        text-decoration: none;
        border-radius: 8px;
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
      .banner-chevron {
        color: var(--mat-sys-primary);
        font-size: 20px;
        width: 20px;
        height: 20px;
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
