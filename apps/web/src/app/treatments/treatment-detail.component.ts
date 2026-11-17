import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type {
  HistoriaClinica,
  Treatment,
  TreatmentItemProgress,
  TreatmentType,
} from '@expedientes/shared-types';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { HistoriaClinicaService } from '../historia-clinica/historia-clinica.service';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { TreatmentsService } from './treatments.service';
import { TreatmentTypesService } from './treatment-types.service';
import { ConsentService } from './consent.service';
import { deliverPdf } from '../shared/pdf/deliver-pdf.util';
import {
  ConsentScanDialogComponent,
  type ConsentScanDialogData,
} from './consent-scan-dialog.component';

interface TreatmentItemForm {
  treatmentTypeId: string;
  name: string;
  active: boolean;
  selected: boolean;
  notes: string;
  itemId: string | null;
  hasConsent: boolean;
  progress: TreatmentItemProgress;
}

type StepKey = 'consent' | 'diagram' | 'products' | 'photos';

const NO_PROGRESS: TreatmentItemProgress = { diagramViews: 0, products: 0, photosBefore: 0, photosAfter: 0 };

@Component({
  selector: 'app-treatment-detail',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslocoModule,
    RouterLink,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <div class="strip">
        <span class="strip-date">{{ 'visitSheet.treatmentOf' | transloco: { date: longDate(fecha()) } }}</span>
        @if (allergyNames()) {
          <span class="allergy-chip">
            <mat-icon aria-hidden="true">warning</mat-icon>
            {{ 'historiaClinica.fields.alergias' | transloco }}: {{ allergyNames() }}
          </span>
        }
      </div>

      <div class="head">
        <h1>{{ 'treatments.detailTitle' | transloco }}</h1>
        @if (canEdit && pendingItems().length > 0) {
          <button mat-stroked-button type="button" (click)="registerScan()">
            <mat-icon aria-hidden="true">document_scanner</mat-icon>
            {{ 'treatments.registerScan' | transloco }}
          </button>
        }
      </div>

      <section class="picker" [attr.aria-label]="'visitSheet.treatmentsToday' | transloco">
        <p class="hint">{{ 'visitSheet.treatmentsToday' | transloco }}</p>
        <div class="chips">
          @for (item of items(); track item.treatmentTypeId) {
            @if (canEdit) {
              <button
                type="button"
                class="chip"
                [class.is-on]="item.selected"
                [attr.aria-pressed]="item.selected"
                [disabled]="item.hasConsent"
                [attr.title]="item.hasConsent ? ('visitSheet.lockedBySignature' | transloco) : null"
                (click)="toggleSelected(item, !item.selected)"
              >
                @if (item.selected) {
                  <mat-icon aria-hidden="true">check</mat-icon>
                }
                {{ item.name }}
                @if (!item.active) {
                  <span class="muted">· {{ 'treatmentCatalog.inactiveBadge' | transloco }}</span>
                }
              </button>
            } @else if (item.selected) {
              <!-- Read-only users see which types were applied, never a disabled control. -->
              <span class="chip is-on is-static">{{ item.name }}</span>
            }
          } @empty {
            <p>{{ 'treatments.noActiveTypes' | transloco }}</p>
          }
        </div>
      </section>

      <div class="cards">
        @for (item of selectedItems(); track item.treatmentTypeId) {
          @let st = stepsOf(item);
          <article class="card" [class.is-current]="item.treatmentTypeId === currentItemId()">
            <header class="card-head">
              <div>
                <h2>{{ item.name }}</h2>
                <p class="hint">{{ 'visitSheet.stepsDone' | transloco: { done: st.done, total: 4 } }}</p>
              </div>
              @if (!item.itemId) {
                <span class="next">{{ 'visitSheet.saveToContinue' | transloco }}</span>
              } @else if (st.next) {
                <span class="next is-marked">
                  <span class="dot" aria-hidden="true"></span>
                  {{ 'visitSheet.next' | transloco: { step: ('visitSheet.step.' + st.next | transloco) } }}
                </span>
              } @else {
                <span class="next"><mat-icon aria-hidden="true">check</mat-icon>{{ 'visitSheet.complete' | transloco }}</span>
              }
            </header>

            @if (item.itemId) {
              <ol class="steps">
                <li class="step" [class.is-next]="st.next === 'consent'">
                  <p class="step-label">1 · {{ 'visitSheet.step.consent' | transloco }}</p>
                  @if (item.hasConsent) {
                    <p class="step-state is-done"><mat-icon aria-hidden="true">check</mat-icon>{{ 'treatments.consentLockedBadge' | transloco }}</p>
                    <a class="step-link" [routerLink]="['/treatments/items', item.itemId, 'consent']">{{ 'treatments.viewConsent' | transloco }}</a>
                  } @else {
                    <p class="step-state">{{ 'visitSheet.notSigned' | transloco }}</p>
                    <div class="step-actions">
                      @if (canEdit) {
                        <a mat-flat-button color="primary" [routerLink]="['/treatments/items', item.itemId, 'consent']">
                          {{ 'treatments.signConsent' | transloco }}
                        </a>
                      }
                      <button mat-button type="button" [disabled]="printingItemId() === item.itemId" (click)="printBlank(item)">
                        <mat-icon aria-hidden="true">print</mat-icon>{{ 'treatments.printBlank' | transloco }}
                      </button>
                    </div>
                  }
                </li>
                <li class="step" [class.is-next]="st.next === 'diagram'">
                  <p class="step-label">2 · {{ 'visitSheet.step.diagram' | transloco }}</p>
                  @if (item.progress.diagramViews > 0) {
                    <p class="step-state is-done">
                      <mat-icon aria-hidden="true">check</mat-icon>{{ 'visitSheet.diagramViews' | transloco: { n: item.progress.diagramViews } }}
                    </p>
                  } @else {
                    <p class="step-state">{{ 'visitSheet.pending' | transloco }}</p>
                  }
                  <a [class]="st.next === 'diagram' && canEdit ? 'step-cta' : 'step-link'" [routerLink]="['/treatments/items', item.itemId, 'diagram']">
                    {{ (canEdit ? 'treatments.editDiagram' : 'treatments.viewDiagram') | transloco }}
                  </a>
                </li>
                <li class="step" [class.is-next]="st.next === 'products'">
                  <p class="step-label">3 · {{ 'visitSheet.step.products' | transloco }}</p>
                  @if (item.progress.products > 0) {
                    <p class="step-state is-done">
                      <mat-icon aria-hidden="true">check</mat-icon>{{ 'visitSheet.productsCount' | transloco: { n: item.progress.products } }}
                    </p>
                  } @else {
                    <p class="step-state">{{ 'visitSheet.notRecorded' | transloco }}</p>
                  }
                  <a [class]="st.next === 'products' && canEdit ? 'step-cta' : 'step-link'" [routerLink]="['/treatments/items', item.itemId, 'products']">
                    {{ (canEdit ? 'visitSheet.recordProduct' : 'treatments.viewProducts') | transloco }}
                  </a>
                </li>
                <li class="step" [class.is-next]="st.next === 'photos'">
                  <p class="step-label">4 · {{ 'visitSheet.step.photos' | transloco }}</p>
                  <p class="step-state" [class.is-done]="item.progress.photosBefore > 0 && item.progress.photosAfter > 0">
                    @if (item.progress.photosBefore > 0 && item.progress.photosAfter > 0) {
                      <mat-icon aria-hidden="true">check</mat-icon>
                    }
                    {{ 'visitSheet.photosState' | transloco: { before: item.progress.photosBefore, after: item.progress.photosAfter } }}
                  </p>
                  <a [class]="st.next === 'photos' && canEdit ? 'step-cta' : 'step-link'" [routerLink]="['/treatments/items', item.itemId, 'photos']">
                    {{ (canEdit ? 'treatments.addPhotos' : 'treatments.viewPhotos') | transloco }}
                  </a>
                </li>
              </ol>
            }

            <div class="notes">
              @if (canEdit) {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'visitSheet.procedureNotes' | transloco }}</mat-label>
                  <textarea
                    matInput
                    [ngModel]="item.notes"
                    (ngModelChange)="setNotes(item, $event)"
                    [ngModelOptions]="{ standalone: true }"
                    rows="2"
                  ></textarea>
                </mat-form-field>
              } @else if (item.notes) {
                <p class="notes-readonly"><strong>{{ 'treatments.notes' | transloco }}:</strong> {{ item.notes }}</p>
              }
            </div>
          </article>
        } @empty {
          <p class="empty">{{ 'visitSheet.pickTreatment' | transloco }}</p>
        }
      </div>

      @if (actionError()) {
        <p class="action-error" role="alert">{{ actionError()! | transloco }}</p>
      }

      @if (canEdit) {
        <div class="save-bar" [class.has-changes]="dirty()">
          <span>{{ (dirty() ? 'visitSheet.unsaved' : 'visitSheet.allSaved') | transloco }}</span>
          <button mat-flat-button color="primary" type="button" [disabled]="saving() || !dirty()" (click)="save()">
            {{ 'common.save' | transloco }}
          </button>
        </div>
      }
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
      .allergy-chip mat-icon,
      .next mat-icon,
      .step-state mat-icon,
      .chip mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }
      .head h1 {
        margin: 0;
      }
      .picker {
        margin-bottom: 20px;
      }
      .hint {
        margin: 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .picker .hint {
        margin-bottom: 8px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: 0 16px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 22px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
      }
      .chip.is-on {
        border: 2px solid var(--mat-sys-on-surface-variant);
        background: var(--mat-sys-surface-container-low);
        font-weight: 600;
      }
      .chip:disabled {
        cursor: not-allowed;
      }
      .chip.is-static {
        cursor: default;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-weight: 400;
      }
      .cards {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .card {
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        overflow: hidden;
      }
      .card.is-current {
        border: 1.5px solid var(--plate-mark);
      }
      .card-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 16px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--plate-line);
      }
      .card-head h2 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
      }
      .next {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .next.is-marked {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .steps {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      }
      .step {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 16px 20px;
        border-right: 1px solid var(--plate-line);
        border-bottom: 1px solid var(--plate-line);
      }
      .step.is-next {
        background: var(--mat-sys-surface-container-low);
      }
      .step-label {
        margin: 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant);
      }
      .step.is-next .step-label {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .step-state {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin: 0 0 6px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .step-state.is-done {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .step-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .step-link {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        font-size: 13px;
        font-weight: 500;
      }
      .step-cta {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 16px;
        border-radius: 20px;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        font-size: 13px;
        font-weight: 500;
        text-decoration: none;
      }
      .notes {
        padding: 16px 20px 4px;
      }
      .full-width {
        width: 100%;
      }
      .notes-readonly {
        margin: 0 0 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty {
        padding: 24px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .action-error {
        color: var(--mat-sys-error);
      }
      .save-bar {
        position: sticky;
        bottom: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 20px;
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
    `,
  ],
})
export class TreatmentDetailComponent implements OnInit {
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly treatmentTypesService = inject(TreatmentTypesService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly consentService = inject(ConsentService);
  private readonly dialog = inject(MatDialog);
  private readonly historiaService = inject(HistoriaClinicaService);
  private readonly transloco = inject(TranslocoService);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly fecha = signal('');
  protected readonly items = signal<TreatmentItemForm[]>([]);
  protected readonly printingItemId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  /** Saved, selected items still waiting for a signed consent — what a scan can cover. */
  protected readonly pendingItems = computed(() =>
    this.items().filter((i) => i.selected && i.itemId && !i.hasConsent)
  );
  protected readonly selectedItems = computed(() => this.items().filter((i) => i.selected));
  /** What was last loaded or saved, to tell whether anything is waiting to be saved. */
  private readonly savedSnapshot = signal('');
  protected readonly dirty = computed(() => this.snapshotOf(this.items()) !== this.savedSnapshot());
  /** The first selected treatment with a step still to do — the one the doctor is on. */
  protected readonly currentItemId = computed(
    () => this.selectedItems().find((i) => i.itemId && this.stepsOf(i).next)?.treatmentTypeId ?? null
  );
  private readonly historia = signal<HistoriaClinica | null>(null);
  protected readonly allergyNames = computed(() =>
    (this.historia()?.allergies ?? []).map((a) => a.allergy.name).join(', ')
  );
  // Plain field, not a signal: matches the established pattern used by
  // FacialDiagramViewsComponent/PhotoGalleryComponent for the same read-only-vs-editable split —
  // permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;
  private treatmentId = '';

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission('treatments', 'edit');
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
      this.savedSnapshot.set(this.snapshotOf(this.items()));
      // Allergies for the strip; only for users who may see the clinical history.
      if (this.auth.hasPermission('historia-clinica', 'view')) {
        void this.historiaService
          .get(treatment.patientId)
          .then((h) => this.historia.set(h))
          .catch(() => this.historia.set(null));
      }
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
        itemId: existing?.id ?? null,
        hasConsent: existing?.hasConsent ?? false,
        progress: existing?.progress ?? NO_PROGRESS,
      };
    });
  }

  protected toggleSelected(item: TreatmentItemForm, selected: boolean): void {
    this.items.update((current) =>
      current.map((i) => (i.treatmentTypeId === item.treatmentTypeId ? { ...i, selected } : i))
    );
  }

  protected setNotes(item: TreatmentItemForm, notes: string): void {
    this.items.update((current) =>
      current.map((i) => (i.treatmentTypeId === item.treatmentTypeId ? { ...i, notes } : i))
    );
  }

  /** The four steps of an item, how many are done, and the first one still to do. */
  protected stepsOf(item: TreatmentItemForm): { done: number; next: StepKey | null } {
    const done: Record<StepKey, boolean> = {
      consent: item.hasConsent,
      diagram: item.progress.diagramViews > 0,
      products: item.progress.products > 0,
      photos: item.progress.photosBefore > 0 && item.progress.photosAfter > 0,
    };
    const order: StepKey[] = ['consent', 'diagram', 'products', 'photos'];
    return {
      done: order.filter((k) => done[k]).length,
      next: order.find((k) => !done[k]) ?? null,
    };
  }

  private snapshotOf(items: TreatmentItemForm[]): string {
    return JSON.stringify(
      items.filter((i) => i.selected).map((i) => [i.treatmentTypeId, i.notes.trim()])
    );
  }

  protected longDate(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  protected async printBlank(item: TreatmentItemForm): Promise<void> {
    if (!item.itemId) return;
    this.printingItemId.set(item.itemId);
    this.actionError.set(null);
    try {
      const blob = await this.consentService.printBlank(item.itemId);
      const safeName = item.name.replace(/[^a-zA-Z0-9]+/g, '-') || 'consentimiento';
      await deliverPdf(blob, `consentimiento-${safeName}.pdf`);
    } catch (error) {
      console.error('Failed to print the blank consent', error);
      this.actionError.set('treatments.printBlankFailed');
    } finally {
      this.printingItemId.set(null);
    }
  }

  protected async registerScan(): Promise<void> {
    const pending = this.pendingItems();
    if (pending.length === 0) return;
    this.actionError.set(null);
    try {
      // The dialog's defaults (place, identification) come from the same detail the sign page reads.
      const detail = await this.consentService.getItem(pending[0].itemId as string);
      const ref = this.dialog.open<ConsentScanDialogComponent, ConsentScanDialogData, string[]>(
        ConsentScanDialogComponent,
        {
          width: '520px',
          data: {
            treatmentId: this.treatmentId,
            pending: pending.map((p) => ({ itemId: p.itemId as string, name: p.name })),
            defaultPlace: detail.defaultPlace,
            patientDocumentId: detail.patientDocumentId,
          },
        }
      );
      const registeredIds = await firstValueFrom(ref.afterClosed());
      if (registeredIds?.length) {
        const registered = new Set(registeredIds);
        this.items.update((current) =>
          current.map((i) => (i.itemId && registered.has(i.itemId) ? { ...i, hasConsent: true } : i))
        );
      }
    } catch (error) {
      console.error('Failed to open the scan registration', error);
      this.actionError.set('common.loadError');
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const selectedItems = this.items()
        .filter((i) => i.selected)
        .map((i) => ({ treatmentTypeId: i.treatmentTypeId, notes: i.notes.trim() || null }));
      const treatment = await this.treatmentsService.updateItems(this.treatmentId, {
        items: selectedItems,
      });
      const savedByTypeId = new Map(treatment.items.map((i) => [i.treatmentTypeId, i]));
      this.items.update((current) =>
        current.map((i) => {
          const saved = savedByTypeId.get(i.treatmentTypeId);
          return saved
            ? { ...i, itemId: saved.id, hasConsent: saved.hasConsent, progress: saved.progress ?? NO_PROGRESS }
            : { ...i, itemId: null, hasConsent: false, progress: NO_PROGRESS };
        })
      );
      this.savedSnapshot.set(this.snapshotOf(this.items()));
    } finally {
      this.saving.set(false);
    }
  }
}
