import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import type { Treatment, TreatmentType } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { TreatmentsService } from './treatments.service';
import { TreatmentTypesService } from './treatment-types.service';

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
        padding: 12px 14px;
        border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        border-radius: 12px;
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
        border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        border-radius: 999px;
        background: var(--mat-sys-surface-container-low, transparent);
        color: var(--mat-sys-on-surface);
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
        transition: background-color 150ms ease-out, border-color 150ms ease-out;
      }
      .item-action:hover {
        background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
        border-color: var(--mat-sys-primary);
      }
      .item-action mat-icon {
        color: var(--mat-sys-primary);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .full-width {
        width: 100%;
      }
      .inactive-badge {
        margin-left: 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
      .notes-readonly {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
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
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
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

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly fecha = signal('');
  protected readonly items = signal<TreatmentItemForm[]>([]);
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
