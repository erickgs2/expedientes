import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { Treatment, TreatmentType } from '@expedientes/shared-types';
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
      <a mat-button class="back-link" routerLink="/treatments">
        <mat-icon>arrow_back</mat-icon>
        {{ 'common.back' | transloco }}
      </a>
      <h1>{{ 'treatments.detailTitle' | transloco }} — {{ patient()?.fullName }}</h1>
      <p>{{ 'valoracion.fields.fecha' | transloco }}: {{ fecha().substring(0, 10) }}</p>
      @for (item of items(); track item.treatmentTypeId) {
        <div class="item-row">
          <!--
            The name/selected-state must always render, even for a treatments:view-only user —
            only the ability to toggle is permission-gated, never the checkbox's presence or
            label, so a read-only user can still see which types exist and which are selected on
            this visit. Mirrors the read-only-vs-editable split used below for notes (and by
            PhotoGalleryComponent/FacialDiagramViewsComponent elsewhere) rather than a disabled
            interactive control, which would render the label at low-contrast disabled-text
            opacity instead of a proper read-only display.
          -->
          @if (canEdit) {
            <mat-checkbox
              [checked]="item.selected"
              [disabled]="item.hasConsent"
              (change)="toggleSelected(item, $event.checked)"
            >
              {{ item.name }}
            </mat-checkbox>
            @if (item.hasConsent) {
              <span class="consent-locked-badge">{{
                'treatments.consentLockedBadge' | transloco
              }}</span>
            }
          } @else {
            <span class="item-readonly">
              <span class="selection-indicator">{{
                (item.selected ? 'treatments.selected' : 'treatments.notSelected') | transloco
              }}</span>
              {{ item.name }}
            </span>
          }
          @if (!item.active) {
            <span class="inactive-badge">{{ 'treatmentCatalog.inactiveBadge' | transloco }}</span>
          }
          @if (item.selected) {
            @if (canEdit) {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'treatments.notes' | transloco }}</mat-label>
                <textarea
                  matInput
                  [(ngModel)]="item.notes"
                  [ngModelOptions]="{ standalone: true }"
                  rows="3"
                ></textarea>
              </mat-form-field>
            } @else if (item.notes) {
              <!-- Read-only equivalent of the textarea above: notes stay visible, never hidden,
                   for a view-only user — just not editable. Only rendered when there's actual
                   note content, so an empty/null note doesn't show a bare "Notas:" label. -->
              <p class="notes-readonly">
                <strong>{{ 'treatments.notes' | transloco }}:</strong> {{ item.notes }}
              </p>
            }
            @if (item.itemId) {
              <div class="item-actions">
                @if (item.hasConsent) {
                  <a class="item-action" [routerLink]="['/treatments/items', item.itemId, 'consent']">
                    <mat-icon aria-hidden="true">task</mat-icon>
                    <span>{{ 'treatments.viewConsent' | transloco }}</span>
                  </a>
                } @else if (canEdit) {
                  <a class="item-action" [routerLink]="['/treatments/items', item.itemId, 'consent']">
                    <mat-icon aria-hidden="true">draw</mat-icon>
                    <span>{{ 'treatments.signConsent' | transloco }}</span>
                  </a>
                }
                @if (!item.hasConsent) {
                  <button
                    type="button"
                    class="item-action"
                    [disabled]="printingItemId() === item.itemId"
                    (click)="printBlank(item)"
                  >
                    <mat-icon aria-hidden="true">print</mat-icon>
                    <span>{{ 'treatments.printBlank' | transloco }}</span>
                  </button>
                }
                <a class="item-action" [routerLink]="['/treatments/items', item.itemId, 'diagram']">
                  <mat-icon aria-hidden="true">face</mat-icon>
                  <span>{{
                    (canEdit ? 'treatments.editDiagram' : 'treatments.viewDiagram') | transloco
                  }}</span>
                </a>
                <a class="item-action" [routerLink]="['/treatments/items', item.itemId, 'photos']">
                  <mat-icon aria-hidden="true">photo_camera</mat-icon>
                  <span>{{
                    (canEdit ? 'treatments.addPhotos' : 'treatments.viewPhotos') | transloco
                  }}</span>
                </a>
                <a class="item-action" [routerLink]="['/treatments/items', item.itemId, 'products']">
                  <mat-icon aria-hidden="true">vaccines</mat-icon>
                  <span>{{
                    (canEdit ? 'treatments.addProducts' : 'treatments.viewProducts') | transloco
                  }}</span>
                </a>
              </div>
            }
          }
        </div>
      } @empty {
        <p>{{ 'treatments.noActiveTypes' | transloco }}</p>
      }
      @if (actionError()) {
        <p class="action-error" role="alert">{{ actionError()! | transloco }}</p>
      }
      @if (canEdit && pendingItems().length > 0) {
        <button mat-stroked-button type="button" class="scan-button" (click)="registerScan()">
          <mat-icon aria-hidden="true">document_scanner</mat-icon>
          {{ 'treatments.registerScan' | transloco }}
        </button>
      }
      @if (canEdit) {
        <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
          {{ 'common.save' | transloco }}
        </button>
      }
    }
  `,
  styles: [
    `
      /* Each selected treatment is its own card, so its notes and actions read as belonging to
         it rather than running together with the next treatment down the page. */
      .item-row {
        margin-bottom: 12px;
        padding: 14px 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
      }
      /* Chips rather than bare text links: they read as tappable and keep a comfortable touch
         target when they wrap on a phone. */
      .item-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .item-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: 0 14px;
        border: 1px solid var(--plate-line);
        border-radius: 8px;
        background: transparent;
        color: var(--mat-sys-on-surface);
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
        transition: background-color 150ms ease-out, border-color 150ms ease-out;
      }
      .item-action:hover {
        background: var(--mat-sys-surface-container-low);
        border-color: var(--plate-line-strong);
      }
      .item-action mat-icon {
        color: var(--mat-sys-on-surface-variant);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .full-width {
        width: 100%;
      }
      button.item-action {
        cursor: pointer;
      }
      .scan-button {
        margin-right: 8px;
      }
      .action-error {
        color: var(--mat-sys-error);
      }
      .inactive-badge {
        margin-left: 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .notes-readonly {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .item-readonly {
        display: inline-block;
      }
      .selection-indicator {
        font-weight: 500;
        margin-right: 6px;
      }
      .consent-locked-badge {
        margin-left: 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
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
      };
    });
  }

  protected toggleSelected(item: TreatmentItemForm, selected: boolean): void {
    this.items.update((current) =>
      current.map((i) => (i.treatmentTypeId === item.treatmentTypeId ? { ...i, selected } : i))
    );
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
            ? { ...i, itemId: saved.id, hasConsent: saved.hasConsent }
            : { ...i, itemId: null, hasConsent: false };
        })
      );
    } finally {
      this.saving.set(false);
    }
  }
}
