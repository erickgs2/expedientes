import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, firstValueFrom, map, startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { PatientPurgeStatus } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from './active-patient.store';
import { PatientsService } from './patients.service';
import {
  PurgePatientDialogComponent,
  type PurgePatientDialogData,
} from './purge-patient-dialog.component';

/**
 * The frame every patient screen sits in. There is no tab bar any more: the overview
 * (`resumen`) is the patient's hub — clinical card plus timeline — and every other screen
 * (historia clínica, a valoración, a treatment, photos, export) shows a single way back to it.
 *
 * An archived patient's record carries a band on every screen saying so, who archived it and why,
 * with the way back (Restaurar) and, for the clinic owner once the five-year retention has passed,
 * the purge. The record itself stays readable and exportable; the API refuses any change to it.
 *
 * Routing and the loaded patient are owned by `patientRouteGuard`; this component only draws.
 */
@Component({
  selector: 'app-patient-workspace',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    @if (activePatient.patient(); as p) {
      @if (p.archivedAt) {
        <section class="archived" role="status">
          <mat-icon class="archived-icon" aria-hidden="true">inventory_2</mat-icon>
          <div class="archived-text">
            <p class="archived-title">
              {{ 'patientDrive.archived.title' | transloco }}
              <span class="archived-when">
                {{ 'patientDrive.archived.when' | transloco: { date: longDate(p.archivedAt), name: p.archivedByName || '—' } }}
              </span>
            </p>
            @if (p.archiveReason) {
              <p class="archived-reason">{{ 'patientDrive.archived.reason' | transloco: { reason: p.archiveReason } }}</p>
            }
            <p class="archived-note">{{ 'patientDrive.archived.readOnly' | transloco }}</p>
          </div>
          @if (canArchive) {
            <div class="archived-actions">
              <button mat-stroked-button type="button" [disabled]="busy()" (click)="restore()">
                <mat-icon>unarchive</mat-icon>{{ 'patientDrive.archived.restore' | transloco }}
              </button>
              @if (purgeStatus()?.canPurge) {
                <button mat-button color="warn" type="button" [disabled]="busy()" (click)="purge()">
                  {{ 'patientDrive.purge.action' | transloco }}
                </button>
              }
            </div>
          }
        </section>
      }
    }
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

      /* A filed record: Proof Grey plate behind a strong hairline, ink text, no rose — only the
         actions carry the mark. */
      .archived {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px 16px;
        margin-bottom: 20px;
        padding: 14px 16px;
        border: 1px solid var(--plate-line-strong);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface-container-low);
      }
      .archived-icon {
        flex: none;
        margin-top: 1px;
        color: var(--mat-sys-on-surface-variant);
      }
      .archived-text {
        flex: 1 1 320px;
        min-width: 0;
      }
      .archived-text p {
        margin: 0;
      }
      .archived-title {
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      .archived-when {
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .archived-reason {
        margin-top: 4px !important;
        color: var(--mat-sys-on-surface);
        overflow-wrap: anywhere;
      }
      .archived-note {
        margin-top: 4px !important;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .archived-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .archived-actions button {
        min-height: 40px;
      }
    `,
  ],
})
export class PatientWorkspaceComponent {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly patientsService = inject(PatientsService);
  private readonly transloco = inject(TranslocoService);
  protected readonly activePatient = inject(ActivePatientStore);
  protected readonly canArchive = inject(AuthService).hasPermission('patients', 'delete');

  protected readonly busy = signal(false);
  protected readonly purgeStatus = signal<PatientPurgeStatus | null>(null);
  private readonly archivedId = computed(() => {
    const p = this.activePatient.patient();
    return p?.archivedAt ? p.id : null;
  });

  protected readonly onOverview = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
      map(() => /\/resumen(?:[?#]|$)/.test(this.router.url))
    ),
    { initialValue: true }
  );

  constructor() {
    // Whether the purge is open is only asked for an archived record, by whoever may archive.
    effect(() => {
      const id = this.archivedId();
      this.purgeStatus.set(null);
      if (!id || !this.canArchive) return;
      this.patientsService
        .purgeStatus(id)
        .then((status) => {
          if (this.archivedId() === id) this.purgeStatus.set(status);
        })
        .catch(() => undefined);
    });
  }

  protected longDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected async restore(): Promise<void> {
    const p = this.activePatient.patient();
    if (!p) return;
    this.busy.set(true);
    try {
      await this.patientsService.restore(p.id);
      this.activePatient.select(await this.patientsService.getById(p.id));
    } finally {
      this.busy.set(false);
    }
  }

  protected async purge(): Promise<void> {
    const p = this.activePatient.patient();
    const status = this.purgeStatus();
    if (!p || !status?.canPurge) return;
    const typed = await firstValueFrom(
      this.dialog
        .open<PurgePatientDialogComponent, PurgePatientDialogData, string | null>(PurgePatientDialogComponent, {
          data: { fullName: p.fullName, lastCare: this.longDate(status.lastCareAt) },
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed()
    );
    if (!typed) return;
    this.busy.set(true);
    try {
      await this.patientsService.purge(p.id, typed);
      this.activePatient.clear();
      await this.router.navigateByUrl('/pacientes');
    } finally {
      this.busy.set(false);
    }
  }
}
