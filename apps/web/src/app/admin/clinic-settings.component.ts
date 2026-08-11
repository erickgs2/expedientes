import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { ClinicSettings, ClinicSettingsInput } from '@expedientes/shared-types';
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
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.clinicName' | transloco }}</mat-label>
          <input matInput formControlName="clinicName" />
        </mat-form-field>
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
          <textarea matInput formControlName="declarationBefore" rows="4"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.declarationAfter' | transloco }}</mat-label>
          <textarea matInput formControlName="declarationAfter" rows="4"></textarea>
        </mat-form-field>
        <p class="hint">{{ 'clinicSettings.placeholderHelp' | transloco }}</p>

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
      .signature-image {
        max-width: 600px;
        display: block;
        margin-bottom: 8px;
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
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
export class ClinicSettingsComponent implements OnInit {
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
  // Plain field, not a signal: matches the pattern used by ConsentSignComponent/TreatmentDetailComponent
  // for the same read-only-vs-editable split — permissions don't change mid-session, so a one-time
  // check in ngOnInit is sufficient.
  protected canEdit = false;

  protected readonly form = this.fb.group({
    clinicName: ['', Validators.required],
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
    this.form.patchValue({
      clinicName: settings?.clinicName ?? '',
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

  protected async save(): Promise<void> {
    if (this.form.invalid || !this.canEdit) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const input: ClinicSettingsInput = {
        clinicName: raw.clinicName ?? '',
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
      const settings = await this.clinicSettingsService.save(input, signature);
      this.applySettings(settings);
      this.signaturePad.clear();
      this.snackBar.open(this.transloco.translate('clinicSettings.saved'), undefined, {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
