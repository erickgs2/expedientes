import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { ActivePatientStore } from './active-patient.store';

/**
 * The frame every patient screen sits in. There is no tab bar any more: the overview
 * (`resumen`) is the patient's hub — clinical card plus timeline — and every other screen
 * (historia clínica, a valoración, a treatment, photos, export) shows a single way back to it.
 *
 * Routing and the loaded patient are owned by `patientRouteGuard`; this component only draws.
 */
@Component({
  selector: 'app-patient-workspace',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatIconModule, TranslocoModule],
  template: `
    @if (!onOverview()) {
      <nav class="back" [attr.aria-label]="'workspace.tabsLabel' | transloco">
        <a routerLink="resumen" class="back-link">
          <mat-icon aria-hidden="true">arrow_back</mat-icon>
          <span>
            {{ 'workspace.backTo' | transloco }}
            @if (activePatient.patient(); as p) {
              <strong>{{ p.fullName }}</strong>
            }
          </span>
        </a>
      </nav>
    }
    <router-outlet></router-outlet>
  `,
  styles: [
    `
      .back {
        margin-bottom: 20px;
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 14px 0 8px;
        border: 1px solid var(--plate-line);
        border-radius: 22px;
        color: var(--mat-sys-on-surface);
        text-decoration: none;
        transition: border-color 150ms ease-out, background-color 150ms ease-out;
      }
      .back-link:hover,
      .back-link:focus-visible {
        border-color: var(--plate-line-strong);
        background: var(--mat-sys-surface-container-low);
      }
      .back-link mat-icon {
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PatientWorkspaceComponent {
  private readonly router = inject(Router);
  protected readonly activePatient = inject(ActivePatientStore);

  protected readonly onOverview = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
      map(() => /\/resumen(?:[?#]|$)/.test(this.router.url))
    ),
    { initialValue: true }
  );
}
