import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import { MAX_SCAN_PAGES } from './consent-scan.limits';
import { toScanPageJpeg } from '../shared/photo/scan-page.util';
import { ConsentService } from './consent.service';

export interface ConsentScanDialogData {
  treatmentId: string;
  pending: { itemId: string; name: string }[];
  defaultPlace: string;
  patientDocumentId: string;
}

/** Closes with the ids of the letters the scan was registered for, or undefined when dismissed. */
@Component({
  selector: 'app-consent-scan-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'treatments.scanDialogTitle' | transloco }}</h2>
    <mat-dialog-content>
      <p class="group-label">{{ 'treatments.scanCovers' | transloco }}</p>
      <div class="covers" role="group">
        @for (item of data.pending; track item.itemId) {
          <mat-checkbox
            [checked]="selectedIds().has(item.itemId)"
            (change)="toggle(item.itemId, $event.checked)"
          >
            {{ item.name }}
          </mat-checkbox>
        }
      </div>

      <form [formGroup]="form" class="fields">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'treatments.scanSignedDate' | transloco }}</mat-label>
          <input matInput type="date" formControlName="signedDate" [max]="today" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'treatments.place' | transloco }}</mat-label>
          <input matInput formControlName="place" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'treatments.patientIdentification' | transloco }}</mat-label>
          <input matInput formControlName="patientIdentification" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'treatments.witnessName' | transloco }}</mat-label>
          <input matInput formControlName="witnessName" />
        </mat-form-field>
      </form>

      <p class="group-label">{{ 'treatments.scanPages' | transloco }}</p>
      <!-- Two pickers, as in the camera-capture component: the one with \`capture\` opens the camera
           app, the one without makes the OS offer the photo library or a scanner app's files. -->
      <input
        #cameraPicker
        type="file"
        accept="image/*"
        capture="environment"
        class="file-input"
        (change)="addFiles(cameraPicker)"
      />
      <input
        #libraryPicker
        type="file"
        accept="image/*"
        multiple
        class="file-input"
        (change)="addFiles(libraryPicker)"
      />
      <div class="picker-actions">
        <button
          mat-stroked-button
          type="button"
          [disabled]="!canAddPages()"
          (click)="cameraPicker.click()"
        >
          <mat-icon aria-hidden="true">add_a_photo</mat-icon>
          {{ 'treatments.scanTakePhoto' | transloco }}
        </button>
        <button
          mat-stroked-button
          type="button"
          [disabled]="!canAddPages()"
          (click)="libraryPicker.click()"
        >
          <mat-icon aria-hidden="true">photo_library</mat-icon>
          {{ 'treatments.scanChooseImages' | transloco }}
        </button>
      </div>
      <ol class="pages">
        @for (file of files(); track $index) {
          <li>
            <span>{{ file.name }}</span>
            <button
              mat-icon-button
              type="button"
              [attr.aria-label]="'treatments.scanRemovePage' | transloco"
              (click)="removeFile($index)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </li>
        }
      </ol>

      @if (errorMessage()) {
        <p class="error-message" role="alert">{{ errorMessage()! | transloco }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canSubmit()"
        (click)="submit()"
      >
        {{ 'treatments.scanRegister' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .group-label {
        margin: 12px 0 4px;
        font-weight: 500;
      }
      .covers {
        display: flex;
        flex-direction: column;
      }
      .fields {
        display: flex;
        flex-direction: column;
        margin-top: 12px;
      }
      .file-input {
        display: none;
      }
      .picker-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pages {
        padding-left: 20px;
      }
      .pages li {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .error-message {
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class ConsentScanDialogComponent {
  protected readonly data = inject<ConsentScanDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ConsentScanDialogComponent, string[]>);
  private readonly consentService = inject(ConsentService);
  private readonly fb = inject(FormBuilder);

  /** Local calendar date, `YYYY-MM-DD` — not `toISOString()`, which is UTC and can be tomorrow. */
  protected readonly today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  protected readonly form = this.fb.group({
    signedDate: [this.today, Validators.required],
    place: [this.data.defaultPlace, Validators.required],
    patientIdentification: [this.data.patientDocumentId, Validators.required],
    witnessName: [''],
  });

  protected readonly selectedIds = signal(new Set(this.data.pending.map((p) => p.itemId)));
  protected readonly files = signal<File[]>([]);
  protected readonly saving = signal(false);
  protected readonly processing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected canSubmit(): boolean {
    return (
      this.form.valid &&
      this.selectedIds().size > 0 &&
      this.files().length > 0 &&
      !this.saving() &&
      !this.processing()
    );
  }

  protected toggle(itemId: string, checked: boolean): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  protected canAddPages(): boolean {
    return this.files().length < MAX_SCAN_PAGES && !this.saving() && !this.processing();
  }

  protected async addFiles(picker: HTMLInputElement): Promise<void> {
    const picked = Array.from(picker.files ?? []);
    // Reset so choosing the same file again (e.g. a retake) still fires `change`.
    picker.value = '';
    if (picked.length === 0) return;

    this.errorMessage.set(null);
    this.processing.set(true);
    try {
      const room = MAX_SCAN_PAGES - this.files().length;
      if (picked.length > room) this.errorMessage.set('treatments.scanTooManyPages');
      const added: File[] = [];
      for (const file of picked.slice(0, Math.max(room, 0))) {
        const page = await toScanPageJpeg(file, this.files().length + added.length + 1);
        if (!page) {
          this.errorMessage.set('treatments.scanImageUnreadable');
          continue;
        }
        added.push(page);
      }
      this.files.update((current) => [...current, ...added]);
    } finally {
      this.processing.set(false);
    }
  }

  protected removeFile(index: number): void {
    this.files.update((current) => current.filter((_, i) => i !== index));
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    const { signedDate, place, patientIdentification, witnessName } = this.form.getRawValue();
    const itemIds = this.data.pending.map((p) => p.itemId).filter((id) => this.selectedIds().has(id));
    try {
      await this.consentService.registerScan(this.data.treatmentId, {
        itemIds,
        signedDate: signedDate ?? '',
        place: place ?? '',
        patientIdentification: patientIdentification ?? '',
        witnessName: (witnessName ?? '').trim() || null,
        pages: this.files(),
      });
      this.dialogRef.close(itemIds);
    } catch (error) {
      console.error('Failed to register consent scan', error);
      this.errorMessage.set('treatments.scanRegisterFailed');
    } finally {
      this.saving.set(false);
    }
  }
}
