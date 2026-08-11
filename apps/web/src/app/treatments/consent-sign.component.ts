import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { Consent, ConsentSignatureRole, TreatmentItemDetail } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { SignaturePadComponent } from '../shared/signature-pad/signature-pad.component';
import { ConsentBlocksComponent } from '../shared/consent/consent-blocks.component';
import { ConsentService } from './consent.service';

@Component({
  selector: 'app-consent-sign',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslocoModule,
    RouterLink,
    SignaturePadComponent,
    ConsentBlocksComponent,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.consentTitle' | transloco }} — {{ item()?.treatmentTypeName }}</h1>
      @if (signedConsent(); as consent) {
        <app-consent-blocks
          [blocks]="item()!.consentDocument!"
          [signatureUrls]="signatureUrls()"
        ></app-consent-blocks>
        <p class="signed-at">
          {{ 'treatments.signedAt' | transloco }} {{ consent.signedAt.substring(0, 10) }}
        </p>
      } @else if (item()!.canSign === false) {
        <p>{{ 'treatments.clinicSettingsIncomplete' | transloco }}</p>
        <a mat-button routerLink="/admin/clinic">{{
          'treatments.goToClinicSettings' | transloco
        }}</a>
      } @else if (canEdit) {
        <form [formGroup]="form" class="consent-form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'treatments.place' | transloco }}</mat-label>
            <input matInput formControlName="place" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'treatments.patientIdentification' | transloco }}</mat-label>
            <input matInput formControlName="patientIdentification" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'treatments.witnessName' | transloco }}</mat-label>
            <input matInput formControlName="witnessName" />
          </mat-form-field>
        </form>
        <app-consent-blocks [blocks]="item()!.consentPreview!"></app-consent-blocks>
        <h3>{{ 'treatments.patientSignature' | transloco }}</h3>
        <app-signature-pad #patientPad [disabled]="signing()"></app-signature-pad>
        @if (witnessNameValue()) {
          <h3>{{ 'treatments.witnessSignature' | transloco }}</h3>
          <app-signature-pad #witnessPad [disabled]="signing()"></app-signature-pad>
        }
        <div class="signature-actions">
          <button
            mat-flat-button
            color="primary"
            [disabled]="
              form.invalid ||
              signing() ||
              !patientPad.hasStrokes() ||
              (!!witnessNameValue() && !witnessPad?.hasStrokes())
            "
            (click)="sign()"
          >
            {{ 'treatments.signAction' | transloco }}
          </button>
        </div>
      } @else {
        <app-consent-blocks [blocks]="item()!.consentPreview!"></app-consent-blocks>
        <p>{{ 'treatments.consentNotYetSigned' | transloco }}</p>
      }
      <button mat-button (click)="back()">{{ 'common.back' | transloco }}</button>
    }
  `,
  styles: [
    `
      .consent-form {
        max-width: 500px;
        display: flex;
        flex-direction: column;
      }
      .full-width {
        width: 100%;
      }
      .signature-actions {
        margin: 8px 0;
        display: flex;
        gap: 8px;
      }
      .signed-at {
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      }
      h3 {
        margin-top: 24px;
      }
    `,
  ],
})
export class ConsentSignComponent implements OnInit {
  private readonly consentService = inject(ConsentService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly signing = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected readonly signedConsent = signal<Consent | null>(null);
  // Plain field, not a signal: matches the established pattern used by
  // TreatmentDetailComponent/PhotoGalleryComponent for the same read-only-vs-editable split —
  // permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;

  protected readonly form = this.fb.group({
    place: ['', Validators.required],
    patientIdentification: ['', Validators.required],
    witnessName: [''],
  });

  private readonly witnessNameRaw = toSignal(this.form.controls.witnessName.valueChanges, {
    initialValue: this.form.controls.witnessName.value,
  });
  protected readonly witnessNameValue = () => (this.witnessNameRaw() ?? '').trim();

  @ViewChild('patientPad') private patientPad?: SignaturePadComponent;
  // Not private: the witness pad only exists inside a conditional template block (rendered only
  // when a witness name is entered), so the template's own `#witnessPad` local reference is out
  // of scope by the time the sign button's [disabled] expression reads it further down — that
  // expression resolves to this class member instead, which must therefore be template-accessible.
  @ViewChild('witnessPad') protected witnessPad?: SignaturePadComponent;

  private itemId = '';

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
    // `TreatmentDetailComponent`/`ValoracionDetailComponent` — never briefly render the wrong
    // patient's consent data.
    let mismatched = false;
    try {
      const item = await this.consentService.getItem(this.itemId);
      if (item.patientId !== this.activePatient.patient()?.id) {
        mismatched = true;
        this.router.navigate(['/treatments']);
        return;
      }
      this.item.set(item);
      this.signedConsent.set(item.consent);
      this.form.patchValue({
        place: item.defaultPlace,
        patientIdentification: item.patientDocumentId,
      });
    } catch (error) {
      console.error('Failed to load treatment item', error);
      this.loadFailed.set(true);
    } finally {
      if (!mismatched) {
        this.loading.set(false);
      }
    }
  }

  protected readonly signatureUrls = () => {
    const consent = this.signedConsent();
    if (!consent) return {} as Partial<Record<ConsentSignatureRole, string>>;
    const urls: Partial<Record<ConsentSignatureRole, string>> = {
      patient: `/api/files/${consent.patientSignatureImagePath}`,
    };
    if (consent.witnessSignatureImagePath) {
      urls.witness = `/api/files/${consent.witnessSignatureImagePath}`;
    }
    return urls;
  };

  protected async sign(): Promise<void> {
    if (!this.patientPad || this.form.invalid) return;
    const item = this.item();
    if (!item) return;
    const witnessName = this.witnessNameValue();
    if (witnessName && !this.witnessPad) return;
    this.signing.set(true);
    try {
      const patientSignature = await this.patientPad.toJpegBlob();
      if (!patientSignature) return;
      let witnessSignature: Blob | null = null;
      if (witnessName) {
        witnessSignature = (await this.witnessPad?.toJpegBlob()) ?? null;
        if (!witnessSignature) return;
      }
      const { place, patientIdentification } = this.form.getRawValue();
      const result = await this.consentService.sign(this.itemId, {
        place: place ?? '',
        patientIdentification: patientIdentification ?? '',
        witnessName: witnessName || null,
        patientSignature,
        witnessSignature,
        templateUpdatedAt: item.consentTemplateUpdatedAt,
        settingsUpdatedAt: item.settingsUpdatedAt ?? '',
      });
      this.item.set({
        ...item,
        consent: result.consent,
        consentDocument: result.consentDocument,
        consentPreview: null,
      });
      this.signedConsent.set(result.consent);
    } finally {
      this.signing.set(false);
    }
  }

  protected back(): void {
    const treatmentId = this.item()?.treatmentId;
    this.router.navigate(treatmentId ? ['/treatments', treatmentId] : ['/treatments']);
  }
}
