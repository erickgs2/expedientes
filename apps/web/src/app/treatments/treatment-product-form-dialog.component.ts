import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { TranslocoModule } from '@jsverse/transloco';
import { Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import type { TreatmentProductRecord } from '@expedientes/shared-types';
import { CameraCaptureComponent } from '../shared/photo/camera-capture.component';
import { TreatmentProductService } from './treatment-product.service';

export interface TreatmentProductFormDialogData {
  itemId: string;
  product: TreatmentProductRecord | null;
}

/**
 * `YYYY-MM-DD` for the picked date, in local time. Not `toISOString()`, which converts to UTC and
 * can shift the date by a day — matches `TreatmentsService`'s identical helper. The server owns
 * expiry normalization (last instant of the printed month); this only sends the month/year the
 * user picked.
 */
function toLocalDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'app-treatment-product-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    TranslocoModule,
    CameraCaptureComponent,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    <h2 mat-dialog-title>
      {{ (data.product ? 'treatments.editProduct' : 'treatments.addProduct') | transloco }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatments.productBrand' | transloco }}</mat-label>
          <input matInput formControlName="brand" [matAutocomplete]="brandAuto" />
          <mat-autocomplete #brandAuto="matAutocomplete">
            @for (brand of brandOptions(); track brand) {
              <mat-option [value]="brand">{{ brand }}</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatments.productLot' | transloco }}</mat-label>
          <input matInput formControlName="lotNumber" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'treatments.productExpiry' | transloco }}</mat-label>
          <input
            matInput
            readonly
            [matDatepicker]="expiryPicker"
            formControlName="expiryDate"
            (click)="expiryPicker.open()"
          />
          <mat-datepicker-toggle matIconSuffix [for]="expiryPicker"></mat-datepicker-toggle>
          <!-- Restricted to picking a month and year: the multi-year start view plus closing on
               monthSelected means a day is never chosen — the server decides what day is stored. -->
          <mat-datepicker
            #expiryPicker
            startView="multi-year"
            (monthSelected)="onMonthSelected($event, expiryPicker)"
          ></mat-datepicker>
        </mat-form-field>

        <div class="photo-field">
          <span class="photo-label">{{ 'treatments.productPhoto' | transloco }}</span>
          @if (photoPreviewUrl()) {
            <img [src]="photoPreviewUrl()" alt="" class="photo-preview" />
          }
          <app-camera-capture (captured)="onPhotoCaptured($event)" />
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .photo-field {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        margin: 8px 0 16px;
      }
      .photo-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
      .photo-preview {
        width: 160px;
        height: 160px;
        object-fit: cover;
        border-radius: 8px;
        background: var(--mat-sys-surface-container-high, #eee);
      }
    `,
  ],
})
export class TreatmentProductFormDialogComponent implements OnDestroy {
  protected readonly dialogRef = inject(MatDialogRef<TreatmentProductFormDialogComponent>);
  private readonly productService = inject(TreatmentProductService);
  private readonly fb = inject(FormBuilder);
  protected readonly saving = signal(false);

  // `data` must be a field injected before any field initializer that reads it (`form`,
  // `photoPreviewUrl` below) — this project's established MAT_DIALOG_DATA field-ordering
  // convention; see TreatmentTypeFormDialogComponent for the production-build-only TS2729 error
  // this avoids.
  protected readonly data = inject<TreatmentProductFormDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.fb.group({
    brand: [this.data.product?.brand ?? '', Validators.required],
    lotNumber: [this.data.product?.lotNumber ?? '', Validators.required],
    expiryDate: [this.data.product?.expiryDate ? new Date(this.data.product.expiryDate) : null],
  });

  protected readonly brandOptions = signal<string[]>([]);
  private readonly photoBlob = signal<Blob | null>(null);
  // Shows the existing photo (if any) until a new one is captured.
  protected readonly photoPreviewUrl = signal<string | null>(
    this.data.product?.photoPath ? `/api/files/${this.data.product.photoPath}` : null
  );
  // Only set once a new photo is captured in this dialog session — tracks the object URL created
  // from that capture so it, and only it, gets revoked on destroy (the existing-photo URL above
  // is a server path, not a blob URL).
  private capturedPhotoUrl: string | null = null;

  private readonly brandSubscription: Subscription;

  constructor() {
    this.brandSubscription = this.form.controls.brand.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((value) => {
          const q = (value ?? '').trim();
          return q.length >= 2 ? this.productService.brands(q) : of([]);
        })
      )
      .subscribe((brands) => this.brandOptions.set(brands));
  }

  protected onMonthSelected(date: Date, picker: MatDatepicker<Date>): void {
    this.form.controls.expiryDate.setValue(date);
    picker.close();
  }

  protected onPhotoCaptured(blob: Blob): void {
    if (this.capturedPhotoUrl) {
      URL.revokeObjectURL(this.capturedPhotoUrl);
    }
    this.photoBlob.set(blob);
    this.capturedPhotoUrl = URL.createObjectURL(blob);
    this.photoPreviewUrl.set(this.capturedPhotoUrl);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const input = {
        brand: (raw.brand ?? '').trim(),
        lotNumber: (raw.lotNumber ?? '').trim(),
        expiryDate: raw.expiryDate ? toLocalDateString(raw.expiryDate) : '',
      };
      // Posts brand, lot, expiry and photo in one request so a product is never persisted
      // half-entered.
      const product = this.data.product
        ? await this.productService.update(
            this.data.itemId,
            this.data.product.id,
            input,
            this.photoBlob()
          )
        : await this.productService.create(this.data.itemId, input, this.photoBlob());
      this.dialogRef.close(product);
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.brandSubscription.unsubscribe();
    if (this.capturedPhotoUrl) {
      URL.revokeObjectURL(this.capturedPhotoUrl);
    }
  }
}
