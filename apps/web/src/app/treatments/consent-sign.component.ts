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
import { deliverPdf } from '../shared/pdf/deliver-pdf.util';

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
        @if (consent.signatureMethod === 'PAPER') {
          <h3>{{ 'treatments.scanSignedOnPaper' | transloco }}</h3>
          <div class="scan-pages">
            @for (page of consent.scanPages; track page) {
              <img
                class="scan-page"
                [src]="'/api/files/' + page"
                [alt]="'treatments.scanPageAlt' | transloco"
              />
            }
          </div>
        }
        <p class="signed-at">
          {{ 'treatments.signedAt' | transloco }}
          {{
            consent.signatureMethod === 'PAPER'
              ? consent.signedDateSnapshot
              : consent.signedAt.substring(0, 10)
          }}
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
        </form>
        <app-consent-blocks [blocks]="item()!.consentPreview!"></app-consent-blocks>

        <!-- NOM-004-SSA3-2012 10.1.1: the patient, two witnesses and the physician sign. The
             physician's signature comes from the clinic settings; the other three are taken here. -->
        <section class="signatures" [attr.aria-label]="'treatments.signatures' | transloco">
          <div class="signer">
            <h3>{{ 'treatments.patientSignature' | transloco }}</h3>
            <app-signature-pad #patientPad [disabled]="signing()"></app-signature-pad>
          </div>

          <div class="signer" [formGroup]="form">
            <h3>{{ 'treatments.firstWitness' | transloco }}</h3>
            <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
              <mat-label>{{ 'treatments.witnessName' | transloco }}</mat-label>
              <input matInput formControlName="witnessName" />
            </mat-form-field>
            <app-signature-pad #witnessPad [disabled]="signing()"></app-signature-pad>
          </div>

          <div class="signer" [formGroup]="form">
            <h3>{{ 'treatments.secondWitness' | transloco }}</h3>
            <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
              <mat-label>{{ 'treatments.witnessName' | transloco }}</mat-label>
              <input matInput formControlName="secondWitnessName" />
            </mat-form-field>
            @if (storedSecondWitness(); as stored) {
              <div class="witness-source" role="radiogroup" [attr.aria-label]="'treatments.secondWitnessSource' | transloco">
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="useStoredSecondWitness()"
                  [class.on]="useStoredSecondWitness()"
                  (click)="useStoredSecondWitness.set(true)"
                >
                  {{ 'treatments.useStoredSignature' | transloco: { name: stored.name } }}
                </button>
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="!useStoredSecondWitness()"
                  [class.on]="!useStoredSecondWitness()"
                  (click)="useStoredSecondWitness.set(false)"
                >
                  {{ 'treatments.signHere' | transloco }}
                </button>
              </div>
            }
            @if (useStoredSecondWitness() && storedSecondWitness()) {
              <p class="stored-note">{{ 'treatments.storedSignatureNote' | transloco }}</p>
            } @else {
              <app-signature-pad #secondWitnessPad [disabled]="signing()"></app-signature-pad>
            }
          </div>
        </section>

        <div class="signature-actions">
          <button
            mat-flat-button
            color="primary"
            [disabled]="form.invalid || signing() || !patientPad.hasStrokes() || !witnessPad.hasStrokes() || !secondWitnessReady()"
            (click)="sign()"
          >
            {{ 'treatments.signAction' | transloco }}
          </button>
          @if (form.invalid || !witnessPad.hasStrokes() || !secondWitnessReady()) {
            <span class="missing">{{ 'treatments.witnessesRequired' | transloco }}</span>
          }
        </div>
      } @else {
        <app-consent-blocks [blocks]="item()!.consentPreview!"></app-consent-blocks>
        <p>{{ 'treatments.consentNotYetSigned' | transloco }}</p>
      }
      @if (!signedConsent() && item()!.canSign !== false) {
        <button mat-stroked-button [disabled]="printing()" (click)="printBlank()">
          {{ 'treatments.printBlank' | transloco }}
        </button>
        @if (printFailed()) {
          <p class="print-error" role="alert">{{ 'treatments.printBlankFailed' | transloco }}</p>
        }
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
      .scan-pages {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 700px;
      }
      .scan-page {
        width: 100%;
        border: 1px solid var(--plate-line);
      }
      .print-error {
        color: var(--mat-sys-error);
      }
      .signed-at {
        color: var(--mat-sys-on-surface-variant);
      }
      h3 {
        margin: 0 0 8px;
        font-size: 1rem;
        font-weight: 600;
      }
      .signatures {
        display: grid;
        gap: 16px;
        margin-top: 24px;
        max-width: 720px;
      }
      /* One plate per signer, each with its own pad: who signs where reads at a glance. */
      .signer {
        padding: 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
      }
      .signer mat-form-field {
        margin-bottom: 8px;
      }
      .witness-source {
        display: inline-grid;
        grid-auto-flow: column;
        margin-bottom: 12px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 22px;
        overflow: hidden;
      }
      .witness-source button {
        min-height: 40px;
        padding: 0 16px;
        border: 0;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .witness-source button + button {
        border-left: 1px solid var(--plate-line-strong);
      }
      .witness-source button.on {
        background: var(--mat-sys-inverse-surface);
        color: var(--mat-sys-inverse-on-surface);
      }
      .stored-note {
        margin: 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .signature-actions {
        align-items: center;
        flex-wrap: wrap;
      }
      .missing {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
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
  protected readonly printing = signal(false);
  protected readonly printFailed = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected readonly signedConsent = signal<Consent | null>(null);
  // Plain field, not a signal: matches the established pattern used by
  // TreatmentDetailComponent/PhotoGalleryComponent for the same read-only-vs-editable split —
  // permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;

  protected readonly form = this.fb.group({
    place: ['', Validators.required],
    patientIdentification: ['', Validators.required],
    // NOM-004-SSA3-2012 10.1.1: two witnesses, both named.
    witnessName: ['', Validators.required],
    secondWitnessName: ['', Validators.required],
  });

  @ViewChild('patientPad') private patientPad?: SignaturePadComponent;
  @ViewChild('witnessPad') private witnessPad?: SignaturePadComponent;
  // Not private: this pad lives inside a conditional block (absent while the clinic's stored
  // signature is chosen), so the template reads it through this member.
  @ViewChild('secondWitnessPad') protected secondWitnessPad?: SignaturePadComponent;

  /** The clinic's usual second witness with a stored signature, offered instead of signing here. */
  protected readonly storedSecondWitness = signal<{ name: string } | null>(null);
  protected readonly useStoredSecondWitness = signal(false);
  private readonly secondWitnessNameRaw = toSignal(this.form.controls.secondWitnessName.valueChanges, {
    initialValue: this.form.controls.secondWitnessName.value,
  });

  /** The second witness has a signature: the stored one (for its own name), or strokes on the pad. */
  protected secondWitnessReady(): boolean {
    const stored = this.storedSecondWitness();
    if (this.useStoredSecondWitness() && stored) {
      return (this.secondWitnessNameRaw() ?? '').trim() === stored.name;
    }
    return !!this.secondWitnessPad?.hasStrokes();
  }

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
        secondWitnessName: item.defaultSecondWitness?.name ?? '',
      });
      if (item.defaultSecondWitness?.hasSignature) {
        this.storedSecondWitness.set({ name: item.defaultSecondWitness.name });
        this.useStoredSecondWitness.set(true);
      }
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
    // A paper-signed consent has no signature images — its scan pages are shown instead.
    if (!consent.patientSignatureImagePath) return {} as Partial<Record<ConsentSignatureRole, string>>;
    const urls: Partial<Record<ConsentSignatureRole, string>> = {
      patient: `/api/files/${consent.patientSignatureImagePath}`,
    };
    if (consent.witnessSignatureImagePath) {
      urls.witness = `/api/files/${consent.witnessSignatureImagePath}`;
    }
    if (consent.secondWitnessSignatureImagePath) {
      urls.secondWitness = `/api/files/${consent.secondWitnessSignatureImagePath}`;
    }
    return urls;
  };

  protected async sign(): Promise<void> {
    if (!this.patientPad || !this.witnessPad || this.form.invalid || !this.secondWitnessReady()) return;
    const item = this.item();
    if (!item) return;
    this.signing.set(true);
    try {
      const patientSignature = await this.patientPad.toJpegBlob();
      const witnessSignature = await this.witnessPad.toJpegBlob();
      if (!patientSignature || !witnessSignature) return;
      // Stored signature chosen and the name still matches it: let the API copy it.
      const useStored = this.useStoredSecondWitness() && !!this.storedSecondWitness();
      const secondWitnessSignature = useStored ? null : ((await this.secondWitnessPad?.toJpegBlob()) ?? null);
      if (!useStored && !secondWitnessSignature) return;
      const { place, patientIdentification, witnessName, secondWitnessName } = this.form.getRawValue();
      const result = await this.consentService.sign(this.itemId, {
        place: place ?? '',
        patientIdentification: patientIdentification ?? '',
        witnessName: (witnessName ?? '').trim(),
        patientSignature,
        witnessSignature,
        secondWitnessName: (secondWitnessName ?? '').trim(),
        secondWitnessSignature,
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

  protected async printBlank(): Promise<void> {
    const item = this.item();
    if (!item) return;
    this.printing.set(true);
    this.printFailed.set(false);
    try {
      const blob = await this.consentService.printBlank(this.itemId);
      const safeName = item.treatmentTypeName.replace(/[^a-zA-Z0-9]+/g, '-') || 'consentimiento';
      await deliverPdf(blob, `consentimiento-${safeName}.pdf`);
    } catch (error) {
      console.error('Failed to print the blank consent', error);
      this.printFailed.set(true);
    } finally {
      this.printing.set(false);
    }
  }

  protected back(): void {
    const treatmentId = this.item()?.treatmentId;
    this.router.navigate(treatmentId ? ['/treatments', treatmentId] : ['/treatments']);
  }
}
