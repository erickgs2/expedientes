import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { TreatmentItemDetail, TreatmentProductRecord } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { TreatmentProductService } from './treatment-product.service';
import { TreatmentsService } from './treatments.service';
import { TreatmentProductFormDialogComponent } from './treatment-product-form-dialog.component';

@Component({
  selector: 'app-treatment-products',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatDialogModule, TranslocoModule],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.productsTitle' | transloco }} — {{ item()?.treatmentTypeName }}</h1>

      @if (canEdit) {
        <button mat-flat-button color="primary" (click)="openCreate()">
          <mat-icon aria-hidden="true">add</mat-icon>
          {{ 'treatments.addProduct' | transloco }}
        </button>
      }

      @if (products().length) {
        <div class="product-list">
          @for (product of products(); track product.id) {
            <div class="product-card">
              @if (product.photoPath) {
                <a [href]="photoUrl(product.photoPath)" target="_blank" rel="noopener">
                  <img [src]="photoUrl(product.photoPath)" alt="" class="product-thumb" />
                </a>
              }
              <div class="product-info">
                <p class="product-brand">{{ product.brand }}</p>
                <p>{{ 'treatments.productLot' | transloco }}: {{ product.lotNumber }}</p>
                @if (product.expiryDate) {
                  <p>{{ 'treatments.productExpiry' | transloco }}: {{ product.expiryDate.substring(0, 7) }}</p>
                }
                @if (isExpired(product)) {
                  <p class="expired-warning">{{ 'treatments.productExpired' | transloco }}</p>
                }
                @if (canEdit) {
                  <div class="product-actions">
                    <button mat-button (click)="openEdit(product)">
                      <mat-icon aria-hidden="true">edit</mat-icon>
                      {{ 'treatments.editProduct' | transloco }}
                    </button>
                    <button mat-button color="warn" (click)="delete(product)">
                      <mat-icon aria-hidden="true">delete</mat-icon>
                      {{ 'treatments.deleteProduct' | transloco }}
                    </button>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="empty-state">{{ 'treatments.noProducts' | transloco }}</p>
      }

      <button mat-button (click)="back()">{{ 'common.back' | transloco }}</button>
    }
  `,
  styles: [
    `
      .product-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
        margin: 16px 0;
      }
      .product-card {
        display: flex;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        border-radius: 12px;
      }
      .product-thumb {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 8px;
        background: var(--mat-sys-surface-container-high, #eee);
        flex-shrink: 0;
      }
      .product-info {
        min-width: 0;
      }
      .product-brand {
        font-weight: 500;
        margin: 0 0 4px;
      }
      .product-info p {
        margin: 0 0 4px;
      }
      .expired-warning {
        color: var(--mat-sys-error, #b3261e);
        font-weight: 500;
      }
      .product-actions {
        display: flex;
        gap: 4px;
        margin-top: 4px;
      }
      .empty-state {
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
    `,
  ],
})
export class TreatmentProductsComponent implements OnInit {
  private readonly treatmentProductService = inject(TreatmentProductService);
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected readonly products = signal<TreatmentProductRecord[]>([]);
  // Plain field, not a signal: matches the established pattern used by
  // TreatmentDetailComponent/PhotoGalleryComponent for the same read-only-vs-editable split —
  // permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;

  private itemId = '';
  private treatmentFecha = '';

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission('treatments', 'edit');
    this.itemId = this.route.snapshot.paramMap.get('itemId') ?? '';
    if (!this.itemId) {
      this.loadFailed.set(true);
      this.loading.set(false);
      return;
    }
    // Set when we redirect away on a patient mismatch, so `finally` leaves the loading state up
    // for the real duration of the navigation, matching the same guard pattern used by
    // `TreatmentPhotoComponent`/`TreatmentDiagramComponent`/`ConsentSignComponent` — never briefly
    // render the wrong patient's product data.
    let mismatched = false;
    try {
      const item = await this.treatmentProductService.getItem(this.itemId);
      if (item.patientId !== this.activePatient.patient()?.id) {
        mismatched = true;
        this.router.navigate(['/treatments']);
        return;
      }
      this.item.set(item);
      // The item detail doesn't carry the parent treatment's date, so it's fetched separately —
      // needed only to flag a product whose printed expiry had already passed by the treatment's
      // own date.
      const [products, treatment] = await Promise.all([
        this.treatmentProductService.list(this.itemId),
        this.treatmentsService.get(item.treatmentId),
      ]);
      this.products.set(products);
      this.treatmentFecha = treatment.fecha;
    } catch (error) {
      console.error('Failed to load treatment item products', error);
      this.loadFailed.set(true);
    } finally {
      if (!mismatched) {
        this.loading.set(false);
      }
    }
  }

  protected photoUrl(photoPath: string): string {
    return `/api/files/${photoPath}`;
  }

  protected isExpired(product: TreatmentProductRecord): boolean {
    if (!product.expiryDate || !this.treatmentFecha) return false;
    return new Date(product.expiryDate).getTime() < new Date(this.treatmentFecha).getTime();
  }

  protected openCreate(): void {
    const ref = this.dialog.open(TreatmentProductFormDialogComponent, {
      data: { itemId: this.itemId, product: null },
    });
    ref.afterClosed().subscribe((saved: TreatmentProductRecord | undefined) => {
      if (saved) this.products.update((current) => [...current, saved]);
    });
  }

  protected openEdit(product: TreatmentProductRecord): void {
    const ref = this.dialog.open(TreatmentProductFormDialogComponent, {
      data: { itemId: this.itemId, product },
    });
    ref.afterClosed().subscribe((saved: TreatmentProductRecord | undefined) => {
      if (saved) {
        this.products.update((current) => current.map((p) => (p.id === saved.id ? saved : p)));
      }
    });
  }

  protected async delete(product: TreatmentProductRecord): Promise<void> {
    // Resolved fresh on each use so a live language switch is reflected, matching
    // `PhotoGalleryComponent`'s identical confirm pattern.
    if (!confirm(this.transloco.translate('treatments.confirmDeleteProduct'))) return;
    await this.treatmentProductService.delete(this.itemId, product.id);
    this.products.update((current) => current.filter((p) => p.id !== product.id));
  }

  protected back(): void {
    const treatmentId = this.item()?.treatmentId;
    this.router.navigate(treatmentId ? ['/treatments', treatmentId] : ['/treatments']);
  }
}
