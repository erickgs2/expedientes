import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { ValoracionDiagram } from '@expedientes/shared-types';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { HistoriaClinicaService } from '../historia-clinica/historia-clinica.service';
import type { HistoriaClinica, ValoracionSummary } from '@expedientes/shared-types';
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
      <div class="strip">
        <span class="strip-date">{{ 'visitSheet.valoracionOf' | transloco: { date: longDate(form.controls.fecha.value) } }}</span>
        @if (allergyNames()) {
          <span class="allergy-chip">
            <mat-icon aria-hidden="true">warning</mat-icon>
            {{ 'historiaClinica.fields.alergias' | transloco }}: {{ allergyNames() }}
          </span>
        }
        <span class="strip-status" aria-live="polite">{{ saveStatus() | transloco: { time: lastSavedAt() } }}</span>
      </div>

      <h1>{{ 'valoracion.detailTitle' | transloco }}</h1>

      <div class="sheet">
        <form class="visit-col" [formGroup]="form" (ngSubmit)="save()">
          <section class="card">
            <h2>{{ 'visitSheet.reason' | transloco }}</h2>
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
            <div *appHasPermission="'valoracion:edit'" class="copy-row">
              <button
                mat-stroked-button
                type="button"
                [disabled]="!historiaHasWantsOrNeeds()"
                (click)="copyFromHistoria()"
              >
                <mat-icon>content_copy</mat-icon>
                {{ 'valoracion.copyFromHistoria' | transloco }}
              </button>
              <span class="hint">
                {{
                  (historiaHasWantsOrNeeds()
                    ? 'valoracion.copyFromHistoriaHelp'
                    : 'valoracion.copyFromHistoriaEmpty'
                  ) | transloco
                }}
              </span>
            </div>
          </section>

          <section class="card">
            <h2>{{ 'valoracion.fields.notas' | transloco }}</h2>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'visitSheet.notesLabel' | transloco }}</mat-label>
              <textarea matInput formControlName="notas" rows="8"></textarea>
            </mat-form-field>
          </section>

          @if (previousVisit(); as prev) {
            <button type="button" class="previous" (click)="openVisit(prev.id)">
              <span class="previous-title">{{ 'visitSheet.previousVisit' | transloco: { date: longDate(prev.fecha) } }}</span>
              <span class="previous-text">
                {{ prev.queNecesitaElPaciente || prev.queQuiereElPaciente || prev.notas || ('visitSheet.previousEmpty' | transloco) }}
              </span>
              <span class="previous-link">{{ 'visitSheet.openPrevious' | transloco }}</span>
            </button>
          }

          <div *appHasPermission="'valoracion:edit'" class="save-bar" [class.has-changes]="dirty()">
            <span>{{ (dirty() ? 'visitSheet.unsaved' : 'visitSheet.allSaved') | transloco }}</span>
            <button mat-flat-button color="primary" type="submit" [disabled]="saving() || !dirty()">
              {{ (saving() ? 'valoracion.saving' : 'common.save') | transloco }}
            </button>
          </div>
        </form>

        <div class="media-col">
          <section class="media">
            <div class="media-head">
              <h2>{{ 'valoracion.sections.diagrams' | transloco }}</h2>
              <span class="hint">{{ 'visitSheet.diagramsHint' | transloco }}</span>
            </div>
            <app-facial-diagram-views
              [dataSource]="diagramDataSource"
              permissionModule="valoracion"
              [diagrams]="diagrams"
            />
          </section>

          <section class="media">
            <div class="media-head">
              <h2>{{ 'valoracion.sections.photos' | transloco }}</h2>
            </div>
            <app-photo-gallery [dataSource]="photoDataSource" permissionModule="valoracion" />
          </section>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .strip {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 16px;
        margin: 0 0 16px;
        padding: 10px 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface-container-low);
      }
      .strip-date {
        flex: 1;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .strip-status {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .allergy-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 30px;
        padding: 0 12px;
        border: 1px solid var(--mat-sys-error);
        border-radius: 15px;
        color: var(--mat-sys-error);
        font-size: 13px;
        font-weight: 600;
      }
      .allergy-chip mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      h1 {
        margin: 0 0 20px;
      }
      .sheet {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        align-items: flex-start;
      }
      .visit-col {
        flex: 1 1 340px;
        max-width: 440px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      @media (max-width: 939px) {
        .visit-col {
          max-width: none;
        }
      }
      .media-col {
        flex: 999 1 540px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 28px;
      }
      .card {
        padding: 20px;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
      }
      h2 {
        margin: 0 0 12px;
        font-size: 1rem;
        font-weight: 600;
      }
      .media-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 4px 12px;
        margin-bottom: 12px;
      }
      .media-head h2 {
        margin: 0;
        font-size: 1.25rem;
        letter-spacing: -0.015em;
      }
      .hint {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .copy-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 12px;
      }
      .copy-row .hint {
        flex: 1;
        min-width: 180px;
      }
      .previous {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;
        padding: 14px 16px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
        color: inherit;
        text-decoration: none;
      }
      .previous:hover,
      .previous:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .previous-title {
        font-weight: 600;
      }
      .previous-text {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .previous-link {
        margin-top: 4px;
        font-size: 13px;
        font-weight: 500;
        color: var(--mat-sys-primary);
      }
      .save-bar {
        position: sticky;
        bottom: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
      }
      .save-bar span {
        flex: 1;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .save-bar.has-changes {
        border-color: var(--plate-mark);
      }
      .save-bar.has-changes span {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .full-width {
        width: 100%;
      }
      .load-error {
        color: var(--mat-sys-error);
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
  private readonly historiaClinicaService = inject(HistoriaClinicaService);
  private readonly transloco = inject(TranslocoService);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadFailed = signal(false);
  protected valoracionId = '';
  protected patientId = '';
  protected diagrams: ValoracionDiagram[] = [];
  protected diagramDataSource!: DiagramDataSource;
  protected photoDataSource!: PhotoDataSource;

  /** The patient's clinical history, for the copy button. Null when they have none recorded. */
  protected readonly historia = signal<HistoriaClinica | null>(null);

  protected readonly form = this.fb.group({
    fecha: [''],
    queQuiereElPaciente: [''],
    queNecesitaElPaciente: [''],
    notas: [''],
  });

  /** The visit before this one, shown as a reference card. */
  protected readonly previousVisit = signal<ValoracionSummary | null>(null);
  protected readonly lastSavedAt = signal('');
  /** `form.dirty` is not a signal; re-read it whenever the values change or a save lands. */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  private readonly savedTick = signal(0);
  protected readonly dirty = computed(() => {
    this.formValue();
    this.savedTick();
    return this.form.dirty;
  });
  protected readonly saveStatus = computed(() =>
    this.dirty()
      ? 'visitSheet.unsaved'
      : this.lastSavedAt()
        ? 'visitSheet.savedAt'
        : 'visitSheet.allSaved'
  );
  protected readonly allergyNames = computed(() =>
    (this.historia()?.allergies ?? []).map((a) => a.allergy.name).join(', ')
  );

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

      // Fetched alongside the visit so the copy button knows whether there is anything to copy.
      // Fire-and-forget: the clinical history is a convenience here, and a patient who has none
      // yet must still be able to record a valoración.
      void this.historiaClinicaService
        .get(this.patientId)
        .then((historia) => this.historia.set(historia))
        .catch(() => this.historia.set(null));
      this.form.patchValue({
        fecha: valoracion.fecha.substring(0, 10),
        queQuiereElPaciente: valoracion.queQuiereElPaciente ?? '',
        queNecesitaElPaciente: valoracion.queNecesitaElPaciente ?? '',
        notas: valoracion.notas ?? '',
      });
      this.form.markAsPristine();
      this.savedTick.update((n) => n + 1);
      this.diagrams = valoracion.diagrams;
      // The visit just before this one, for the reference card. Same patient-scoped list the
      // reference picker uses; failing to load it only hides the card.
      void this.valoracionService
        .list(this.patientId)
        .then((visits) => this.previousVisit.set(this.pickPrevious(visits, valoracion.fecha)))
        .catch(() => this.previousVisit.set(null));
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

  protected historiaHasWantsOrNeeds(): boolean {
    const h = this.historia();
    return Boolean(h?.queQuiereElPaciente?.trim() || h?.queNecesitaElPaciente?.trim());
  }

  /**
   * Copies what the patient wants and needs from their clinical history into this visit.
   *
   * Overwrites both fields — the button is an explicit action, and silently merging or appending
   * would be harder to reason about than retyping. Nothing is stored until the form is submitted.
   */
  protected copyFromHistoria(): void {
    const h = this.historia();
    if (!h) return;
    this.form.patchValue({
      queQuiereElPaciente: h.queQuiereElPaciente ?? '',
      queNecesitaElPaciente: h.queNecesitaElPaciente ?? '',
    });
    this.form.markAsDirty();
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
      this.form.markAsPristine();
      this.savedTick.update((n) => n + 1);
      this.lastSavedAt.set(
        new Date().toLocaleTimeString(this.transloco.getActiveLang(), {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Opens another visit of this patient. Goes through a throwaway navigation first because the
   * router would otherwise reuse this component for the same route and keep showing this visit:
   * the page and its diagram previews are built once, from the id read on init.
   */
  protected async openVisit(id: string): Promise<void> {
    if (this.form.dirty && !confirm(this.transloco.translate('visitSheet.leaveUnsaved'))) return;
    await this.router.navigateByUrl('/', { skipLocationChange: true });
    await this.router.navigate(['/pacientes', this.patientId, 'valoracion', id]);
  }

  /** The most recent other visit dated on or before this one; the patient-scoped list only. */
  private pickPrevious(visits: ValoracionSummary[], fecha: string): ValoracionSummary | null {
    const current = new Date(fecha).getTime();
    return (
      visits
        .filter((v) => v.id !== this.valoracionId && v.patientId === this.patientId)
        .filter((v) => new Date(v.fecha).getTime() <= current)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0] ?? null
    );
  }

  /** `11 nov 2026` from a `YYYY-MM-DD` or ISO string, read as a calendar date. */
  protected longDate(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(`${value.substring(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
