import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { ClinicSettings, ClinicSettingsInput } from '@expedientes/shared-types';
import {
  DEFAULT_DECLARATION_AFTER,
  DEFAULT_DECLARATION_BEFORE,
} from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { SignaturePadComponent } from '../shared/signature-pad/signature-pad.component';
import { ClinicSettingsService } from './clinic-settings.service';

@Component({
  selector: 'app-clinic-settings',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslocoModule,
    SignaturePadComponent,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'clinicSettings.title' | transloco }}</h1>
      <form [formGroup]="form" (ngSubmit)="save()">
        <h2 class="first-heading">{{ 'clinicSettings.logo' | transloco }}</h2>
        <p class="hint">{{ 'clinicSettings.logoHelp' | transloco }}</p>
        @if (logoPreviewUrl(); as preview) {
          <img class="logo-image" [src]="preview" [alt]="'clinicSettings.logo' | transloco" />
        } @else {
          <p class="hint">{{ 'clinicSettings.noLogo' | transloco }}</p>
        }
        @if (canEdit) {
          <input
            #logoInput
            type="file"
            accept="image/png,image/jpeg"
            class="visually-hidden"
            (change)="onLogoSelected($event)"
          />
          <button
            mat-stroked-button
            type="button"
            [disabled]="saving()"
            (click)="logoInput.click()"
          >
            <mat-icon>image</mat-icon>
            {{ (logoPreviewUrl() ? 'clinicSettings.replaceLogo' : 'clinicSettings.uploadLogo') | transloco }}
          </button>
        }

        <h2>{{ 'clinicSettings.identity' | transloco }}</h2>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.defaultPlace' | transloco }}</mat-label>
          <input matInput formControlName="defaultPlace" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.doctorTitle' | transloco }}</mat-label>
          <input matInput formControlName="doctorTitle" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.doctorName' | transloco }}</mat-label>
          <input matInput formControlName="doctorName" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.doctorLicense' | transloco }}</mat-label>
          <input matInput formControlName="doctorLicense" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.declarationBefore' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="declarationBefore"
            rows="6"
            [placeholder]="defaultDeclarationBefore"
          ></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.declarationAfter' | transloco }}</mat-label>
          <textarea
            matInput
            formControlName="declarationAfter"
            rows="10"
            [placeholder]="defaultDeclarationAfter"
          ></textarea>
        </mat-form-field>
        <p class="hint">{{ 'clinicSettings.placeholderHelp' | transloco }}</p>
        @if (canEdit) {
          <div class="restore-row">
            <button mat-stroked-button type="button" (click)="restoreSuggestedDeclarations()">
              <mat-icon>restart_alt</mat-icon>
              {{ 'clinicSettings.restoreSuggested' | transloco }}
            </button>
            <span class="hint">{{ 'clinicSettings.restoreSuggestedHelp' | transloco }}</span>
          </div>
        }

        <h2>{{ 'clinicSettings.doctorSignature' | transloco }}</h2>
        @if (currentSignaturePath(); as path) {
          <p>{{ 'clinicSettings.currentSignature' | transloco }}</p>
          <img
            class="signature-image"
            [src]="signatureUrl(path)"
            [alt]="'clinicSettings.doctorSignature' | transloco"
          />
          <p>{{ 'clinicSettings.replaceSignature' | transloco }}</p>
        }
        <app-signature-pad #signaturePad [disabled]="saving() || !canEdit"></app-signature-pad>

        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="form.invalid || saving() || !canEdit"
        >
          {{ 'common.save' | transloco }}
        </button>
      </form>
    }
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .hint {
        margin: -8px 0 16px;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
      .restore-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 16px;
      }
      .restore-row .hint {
        margin: 0;
        flex: 1;
        min-width: 220px;
      }
      .signature-image {
        max-width: 600px;
        display: block;
        margin-bottom: 8px;
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
      }
      .logo-image {
        max-width: 320px;
        max-height: 140px;
        display: block;
        margin-bottom: 8px;
        /* Checkerboard so a transparent PNG reads as transparent rather than as a white block. */
        background:
          repeating-conic-gradient(rgba(0, 0, 0, 0.06) 0% 25%, transparent 0% 50%) 50% / 16px 16px;
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      h2.first-heading {
        margin-top: 0;
      }
      h2 {
        margin-top: 24px;
      }
      button[type='submit'] {
        margin-top: 16px;
      }
    `,
  ],
})
export class ClinicSettingsComponent implements OnInit, OnDestroy {
  private readonly clinicSettingsService = inject(ClinicSettingsService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  @ViewChild('signaturePad') private signaturePad!: SignaturePadComponent;

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly currentSignaturePath = signal<string | null>(null);
  // Either the stored logo's served URL or an object URL for a file picked but not yet saved, so
  // the preview always shows what pressing Guardar would produce.
  protected readonly logoPreviewUrl = signal<string | null>(null);
  private pendingLogo: File | null = null;
  private pendingLogoObjectUrl: string | null = null;
  // Plain field, not a signal: matches the pattern used by ConsentSignComponent/TreatmentDetailComponent
  // for the same read-only-vs-editable split — permissions don't change mid-session, so a one-time
  // check in ngOnInit is sufficient.
  protected canEdit = false;

  // Shown as the textareas' placeholder text, so an empty field teaches the expected wording and
  // the `{{...}}` markers instead of leaving the user to invent legal boilerplate from scratch.
  protected readonly defaultDeclarationBefore = DEFAULT_DECLARATION_BEFORE;
  protected readonly defaultDeclarationAfter = DEFAULT_DECLARATION_AFTER;

  protected readonly form = this.fb.group({
    defaultPlace: ['', Validators.required],
    doctorTitle: ['', Validators.required],
    doctorName: ['', Validators.required],
    doctorLicense: ['', Validators.required],
    declarationBefore: ['', Validators.required],
    declarationAfter: ['', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission('clinic-settings', 'edit');
    try {
      const settings = await this.clinicSettingsService.get();
      this.applySettings(settings);
    } catch (error) {
      console.error('Failed to load clinic settings', error);
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private applySettings(settings: ClinicSettings | null): void {
    this.currentSignaturePath.set(settings?.doctorSignaturePath ?? null);
    // A file picked but not yet saved wins over the stored one, so reloading settings mid-edit
    // doesn't silently discard the user's pending choice.
    if (!this.pendingLogo) {
      this.logoPreviewUrl.set(
        settings?.clinicLogoPath ? this.signatureUrl(settings.clinicLogoPath) : null
      );
    }
    this.form.patchValue({
      defaultPlace: settings?.defaultPlace ?? '',
      doctorTitle: settings?.doctorTitle ?? '',
      doctorName: settings?.doctorName ?? '',
      doctorLicense: settings?.doctorLicense ?? '',
      declarationBefore: settings?.declarationBefore ?? '',
      declarationAfter: settings?.declarationAfter ?? '',
    });
  }

  protected signatureUrl(path: string): string {
    return `/api/files/${path}`;
  }

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Clear the input's value so picking the same file twice in a row still fires `change`.
    input.value = '';
    if (!file) return;
    this.releasePendingLogoUrl();
    this.pendingLogo = file;
    this.pendingLogoObjectUrl = URL.createObjectURL(file);
    this.logoPreviewUrl.set(this.pendingLogoObjectUrl);
  }

  private releasePendingLogoUrl(): void {
    if (this.pendingLogoObjectUrl) {
      URL.revokeObjectURL(this.pendingLogoObjectUrl);
      this.pendingLogoObjectUrl = null;
    }
  }

  ngOnDestroy(): void {
    this.releasePendingLogoUrl();
  }

  /**
   * Puts the reference wording back into both declaration fields. Only fills the form — nothing is
   * stored until Guardar, so this is recoverable by navigating away, and it never touches a consent
   * that has already been signed.
   */
  protected restoreSuggestedDeclarations(): void {
    this.form.patchValue({
      declarationBefore: DEFAULT_DECLARATION_BEFORE,
      declarationAfter: DEFAULT_DECLARATION_AFTER,
    });
    this.form.markAsDirty();
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || !this.canEdit) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const input: ClinicSettingsInput = {
        defaultPlace: raw.defaultPlace ?? '',
        doctorTitle: raw.doctorTitle ?? '',
        doctorName: raw.doctorName ?? '',
        doctorLicense: raw.doctorLicense ?? '',
        declarationBefore: raw.declarationBefore ?? '',
        declarationAfter: raw.declarationAfter ?? '',
      };
      const signature = this.signaturePad.hasStrokes()
        ? await this.signaturePad.toJpegBlob()
        : null;
      const settings = await this.clinicSettingsService.save(input, signature, this.pendingLogo);
      // Clear the pending file first so `applySettings` adopts the stored logo's URL, then release
      // the object URL the preview was using.
      this.pendingLogo = null;
      this.applySettings(settings);
      this.releasePendingLogoUrl();
      this.signaturePad.clear();
      this.snackBar.open(this.transloco.translate('clinicSettings.saved'), undefined, {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
