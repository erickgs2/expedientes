import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
  imports: [MatIconModule, 
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
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
      <button type="button" class="back" (click)="back()">‹ {{ 'treatments.consentScreen.backToVisit' | transloco }}</button>
      <header class="head">
        <div class="titles">
          <h1>{{ 'treatments.consentScreen.title' | transloco }}</h1>
          <p class="sub">{{ item()!.treatmentTypeName }} · {{ item()!.patientName }}</p>
        </div>
        <div class="head-side">
          @if (signedConsent(); as consent) {
            <span class="state is-signed">
              <mat-icon aria-hidden="true">verified</mat-icon>
              {{ 'treatments.consentScreen.signedOn' | transloco: { date: signedDate(consent) } }}
              · {{ (consent.signatureMethod === 'PAPER' ? 'treatments.consentScreen.onPaper' : 'treatments.consentScreen.onScreen') | transloco }}
            </span>
          } @else {
            <span class="state"><span class="dot" aria-hidden="true"></span>{{ 'treatments.consentScreen.unsigned' | transloco }}</span>
            @if (canEdit && item()!.canSign !== false) {
              <div class="method" role="radiogroup" [attr.aria-label]="'treatments.consentScreen.method' | transloco">
                <button type="button" role="radio" [attr.aria-checked]="method() === 'screen'" [class.on]="method() === 'screen'" (click)="method.set('screen')">
                  {{ 'treatments.consentScreen.onScreen' | transloco }}
                </button>
                <button type="button" role="radio" [attr.aria-checked]="method() === 'paper'" [class.on]="method() === 'paper'" (click)="method.set('paper')">
                  {{ 'treatments.consentScreen.onPaper' | transloco }}
                </button>
              </div>
            }
          }
        </div>
      </header>

      @if (signedConsent(); as consent) {
        <div class="sheet is-signed">
          <app-consent-blocks [blocks]="item()!.consentDocument!" [signatureUrls]="signatureUrls()"></app-consent-blocks>
        </div>
        @if (consent.signatureMethod === 'PAPER') {
          <h2 class="scans-title">{{ 'treatments.scanSignedOnPaper' | transloco }}</h2>
          <div class="scan-pages">
            @for (page of consent.scanPages; track page) {
              <img class="scan-page" [src]="'/api/files/' + page" [alt]="'treatments.scanPageAlt' | transloco" />
            }
          </div>
        }
      } @else if (item()!.canSign === false) {
        <p>{{ 'treatments.clinicSettingsIncomplete' | transloco }}</p>
        <a mat-button routerLink="/admin/clinic">{{ 'treatments.goToClinicSettings' | transloco }}</a>
      } @else {
        <div class="layout">
          <article class="doc" [attr.aria-label]="'treatments.consentScreen.document' | transloco">
            <div class="doc-meta">
              <span>{{ 'treatments.consentScreen.document' | transloco }}</span>
              <span>{{ 'treatments.consentScreen.read' | transloco: { n: readPercent() } }}</span>
            </div>
            <div class="progress" aria-hidden="true"><span [style.width.%]="readPercent()"></span></div>
            <div #sheet class="sheet" tabindex="0" (scroll)="onSheetScroll()">
              <app-consent-blocks [blocks]="item()!.consentPreview!"></app-consent-blocks>
            </div>
          </article>

          @if (canEdit) {
            <aside class="rail" [attr.aria-label]="'treatments.consentScreen.signing' | transloco">
              <div class="rail-head">
                <h2>{{ 'treatments.consentScreen.signing' | transloco }}</h2>
                <p>{{ (method() === 'screen' ? 'treatments.consentScreen.railHint' : 'treatments.consentScreen.paperHint') | transloco }}</p>
              </div>

              @if (method() === 'screen') {
                <section class="step" [formGroup]="form">
                  <h3>1 · {{ 'treatments.consentScreen.details' | transloco }} @if (detailsDone()) {<span class="done">✓</span>}</h3>
                  <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                    <mat-label>{{ 'treatments.place' | transloco }}</mat-label>
                    <input matInput formControlName="place" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                    <mat-label>{{ 'treatments.patientIdentification' | transloco }}</mat-label>
                    <input matInput formControlName="patientIdentification" />
                  </mat-form-field>
                </section>

                <section class="step">
                  <h3>2 · {{ 'treatments.consentScreen.reading' | transloco }}</h3>
                  <mat-checkbox [checked]="readConfirmed()" (change)="readConfirmed.set($event.checked)" [disabled]="signing()">
                    {{ 'treatments.consentScreen.readConfirm' | transloco }}
                  </mat-checkbox>
                </section>

                <section class="step">
                  <h3>3 · {{ 'treatments.patientSignature' | transloco }}</h3>
                  <app-signature-pad
                    #patientPad
                    [disabled]="signing()"
                    [caption]="item()!.patientName"
                    [title]="'treatments.patientSignature' | transloco"
                  ></app-signature-pad>
                </section>

                <section class="step witnesses-step" [formGroup]="form">
                  @if (!showWitnesses()) {
                    <button mat-button type="button" class="text-action" [disabled]="signing()" (click)="showWitnesses.set(true)">
                      + {{ 'treatments.addWitnesses' | transloco }}
                    </button>
                    <p class="note">{{ 'treatments.witnessesOptionalHint' | transloco }}</p>
                  } @else {
                    <div class="witnesses-head">
                      <h3>{{ 'treatments.witnesses' | transloco }} <span class="optional">{{ 'clinical.optional' | transloco }}</span></h3>
                      <button mat-button type="button" [disabled]="signing()" (click)="hideWitnesses()">
                        {{ 'treatments.removeWitnesses' | transloco }}
                      </button>
                    </div>
                    <div class="witness">
                      <p class="witness-title">{{ 'treatments.firstWitness' | transloco }}</p>
                      <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                        <mat-label>{{ 'treatments.witnessName' | transloco }}</mat-label>
                        <input matInput formControlName="witnessName" />
                      </mat-form-field>
                      <app-signature-pad
                        #witnessPad
                        [disabled]="signing()"
                        [caption]="form.controls.witnessName.value || null"
                        [title]="'treatments.firstWitness' | transloco"
                      ></app-signature-pad>
                    </div>
                    <div class="witness">
                      <p class="witness-title">{{ 'treatments.secondWitness' | transloco }}</p>
                      <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                        <mat-label>{{ 'treatments.witnessName' | transloco }}</mat-label>
                        <input matInput formControlName="secondWitnessName" />
                      </mat-form-field>
                      @if (storedSecondWitness(); as stored) {
                        <div class="witness-source" role="radiogroup" [attr.aria-label]="'treatments.secondWitnessSource' | transloco">
                          <button type="button" role="radio" [attr.aria-checked]="useStoredSecondWitness()" [class.on]="useStoredSecondWitness()" (click)="useStoredSecondWitness.set(true)">
                            {{ 'treatments.useStoredSignature' | transloco: { name: stored.name } }}
                          </button>
                          <button type="button" role="radio" [attr.aria-checked]="!useStoredSecondWitness()" [class.on]="!useStoredSecondWitness()" (click)="useStoredSecondWitness.set(false)">
                            {{ 'treatments.signHere' | transloco }}
                          </button>
                        </div>
                      }
                      @if (useStoredSecondWitness() && storedSecondWitness()) {
                        <p class="note">{{ 'treatments.storedSignatureNote' | transloco }}</p>
                      } @else {
                        <app-signature-pad
                          #secondWitnessPad
                          [disabled]="signing()"
                          [caption]="form.controls.secondWitnessName.value || null"
                          [title]="'treatments.secondWitness' | transloco"
                        ></app-signature-pad>
                      }
                    </div>
                  }
                </section>

                <p class="doctor">{{ 'treatments.consentScreen.doctorSignature' | transloco }}</p>

                <div class="rail-foot">
                  <button
                    mat-flat-button
                    type="button"
                    class="sign"
                    [disabled]="form.invalid || signing() || !readConfirmed() || !patientPad.hasStrokes() || !witnessesOk()"
                    (click)="sign()"
                  >
                    {{ 'treatments.signAction' | transloco }}
                  </button>
                  @if (missingKey(patientPad.hasStrokes()); as key) {
                    <p class="missing">{{ key | transloco }}</p>
                  }
                  <button mat-button type="button" [disabled]="printing()" (click)="printBlank()">
                    {{ 'treatments.printBlank' | transloco }}
                  </button>
                </div>
              } @else {
                <ol class="paper-steps">
                  <li>{{ 'treatments.consentScreen.paperStep1' | transloco }}</li>
                  <li>{{ 'treatments.consentScreen.paperStep2' | transloco }}</li>
                  <li>{{ 'treatments.consentScreen.paperStep3' | transloco }}</li>
                </ol>
                <div class="rail-foot">
                  <button mat-flat-button type="button" class="sign" [disabled]="printing()" (click)="printBlank()">
                    {{ 'treatments.printBlank' | transloco }}
                  </button>
                  <button mat-button type="button" (click)="back()">{{ 'treatments.consentScreen.registerScanAtVisit' | transloco }}</button>
                </div>
              }
              @if (printFailed()) {
                <p class="print-error" role="alert">{{ 'treatments.printBlankFailed' | transloco }}</p>
              }
            </aside>
          } @else {
            <p class="not-signed">{{ 'treatments.consentNotYetSigned' | transloco }}</p>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1240px;
        font-variant-numeric: tabular-nums;
      }
      .back {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--mat-sys-primary);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px 24px;
        margin: 4px 0 20px;
      }
      .head h1 {
        margin: 0;
      }
      .sub {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .head-side {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px 16px;
      }
      .state {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }
      .state.is-signed mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--mat-sys-on-surface-variant);
      }
      /* Unsigned is a pending action: the one rose mark on the page. */
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .method,
      .witness-source {
        display: inline-grid;
        grid-auto-flow: column;
        border: 1px solid var(--plate-line-strong);
        border-radius: 22px;
        overflow: hidden;
      }
      .method button,
      .witness-source button {
        min-height: 40px;
        padding: 0 16px;
        border: 0;
        background: transparent;
        color: var(--mat-sys-on-surface);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .method button + button,
      .witness-source button + button {
        border-left: 1px solid var(--plate-line-strong);
      }
      .method button.on,
      .witness-source button.on {
        background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
        color: var(--mat-sys-primary);
      }
      .layout {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 24px;
      }
      .doc {
        flex: 999 1 560px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .doc-meta {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .progress {
        height: 2px;
        border-radius: 1px;
        background: var(--plate-line);
      }
      .progress span {
        display: block;
        height: 2px;
        border-radius: 1px;
        background: var(--mat-sys-on-surface);
        transition: width 120ms linear;
      }
      /* The document is a sheet of paper: ink on white in either theme. */
      .sheet {
        padding: 32px 40px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: #fff;
        color: #1c1c19;
      }
      @media (min-width: 1024px) {
        .doc .sheet {
          max-height: calc(100dvh - 260px);
          overflow-y: auto;
        }
      }
      .sheet.is-signed {
        max-width: 860px;
      }
      .rail {
        flex: 1 1 340px;
        max-width: 420px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
      }
      @media (min-width: 1024px) {
        .rail {
          position: sticky;
          top: 16px;
        }
      }
      .rail-head,
      .step,
      .doctor,
      .rail-foot,
      .paper-steps {
        padding: 16px 20px;
        border-bottom: 1px solid var(--plate-line);
      }
      .rail-head h2 {
        margin: 0;
        font-size: 1.125rem;
      }
      .rail-head p,
      .note,
      .doctor {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .step h3 {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 600;
      }
      .done {
        margin-left: 4px;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .text-action {
        align-self: flex-start;
        margin-left: -12px;
      }
      .witnesses-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .optional {
        font-weight: 400;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .witness {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--plate-line);
      }
      .witness-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .rail-foot {
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-bottom: 0;
      }
      .sign {
        min-height: 48px;
      }
      .missing {
        margin: 0;
        font-size: 13px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .paper-steps {
        margin: 0;
        padding-left: 40px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .print-error {
        margin: 0 20px 16px;
        color: var(--mat-sys-error);
      }
      .scans-title {
        font-size: 1rem;
      }
      .scan-pages {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 860px;
      }
      .scan-page {
        width: 100%;
        border: 1px solid var(--plate-line);
      }
      .full-width {
        width: 100%;
      }
      .not-signed {
        flex: 1 1 300px;
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
    // Optional (NOM-004-SSA3-2012 10.1.1 asks for two; the clinic decides): a witness given is
    // whole, name and signature, which `witnessesOk` checks.
    witnessName: [''],
    secondWitnessName: [''],
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

  /** Signed on the screen, or printed blank to be signed on paper and scanned. */
  protected readonly method = signal<'screen' | 'paper'>('screen');
  /** The doctor confirms the patient read the document before she signs. */
  protected readonly readConfirmed = signal(false);
  /** How far the document sheet has been scrolled, for the reading bar. */
  protected readonly readPercent = signal(0);
  @ViewChild('sheet') private sheetRef?: ElementRef<HTMLElement>;
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  protected detailsDone(): boolean {
    return this.formStatus() === 'VALID';
  }

  protected onSheetScroll(): void {
    const el = this.sheetRef?.nativeElement;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.round((el.scrollTop / max) * 100);
    if (pct > this.readPercent()) this.readPercent.set(Math.min(100, pct));
  }

  /** What still keeps "Firmar" disabled, in the order the rail asks for it. */
  protected missingKey(patientSigned: boolean): string | null {
    if (this.formStatus() !== 'VALID') return 'treatments.consentScreen.missingDetails';
    if (!this.readConfirmed()) return 'treatments.consentScreen.missingReading';
    if (!patientSigned) return 'treatments.consentScreen.missingPatient';
    if (!this.witnessesOk()) return 'treatments.witnessIncomplete';
    return null;
  }

  protected signedDate(consent: Consent): string {
    return consent.signatureMethod === 'PAPER' ? consent.signedDateSnapshot : consent.signedAt.substring(0, 10);
  }

  /** Witnesses are hidden until the user adds them; hidden, none is sent. */
  protected readonly showWitnesses = signal(false);
  private readonly witnessNameRaw = toSignal(this.form.controls.witnessName.valueChanges, {
    initialValue: this.form.controls.witnessName.value,
  });

  protected hideWitnesses(): void {
    this.showWitnesses.set(false);
    this.form.controls.witnessName.setValue('');
    this.witnessPad?.clear();
    this.secondWitnessPad?.clear();
  }

  private firstWitnessName(): string {
    return (this.witnessNameRaw() ?? '').trim();
  }

  private secondWitnessName(): string {
    return (this.secondWitnessNameRaw() ?? '').trim();
  }

  /**
   * Each witness is either complete (name and signature) or empty; half a witness blocks signing so
   * a name never prints without its signature, or a signature without a name.
   */
  protected witnessesOk(): boolean {
    if (!this.showWitnesses()) return true;
    const firstName = !!this.firstWitnessName();
    const firstSigned = !!this.witnessPad?.hasStrokes();
    if (firstName !== firstSigned) return false;
    const secondName = !!this.secondWitnessName();
    const secondSigned = this.secondWitnessReady() || !!this.secondWitnessPad?.hasStrokes();
    return secondName === secondSigned;
  }

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
        // A document short enough to fit needs no scrolling: it reads as fully read.
        setTimeout(() => this.onSheetScroll());
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
    if (!this.patientPad || this.form.invalid || !this.readConfirmed() || !this.witnessesOk()) return;
    const item = this.item();
    if (!item) return;
    this.signing.set(true);
    try {
      const patientSignature = await this.patientPad.toJpegBlob();
      if (!patientSignature) return;
      const show = this.showWitnesses();
      let witness: { name: string; signature: Blob } | null = null;
      if (show && this.firstWitnessName()) {
        const signature = await this.witnessPad?.toJpegBlob();
        if (!signature) return;
        witness = { name: this.firstWitnessName(), signature };
      }
      let secondWitness: { name: string; signature: Blob | null } | null = null;
      if (show && this.secondWitnessName()) {
        // Stored signature chosen and the name still matches it: let the API copy it.
        const useStored = this.useStoredSecondWitness() && this.secondWitnessReady() && !!this.storedSecondWitness();
        const signature = useStored ? null : ((await this.secondWitnessPad?.toJpegBlob()) ?? null);
        if (!useStored && !signature) return;
        secondWitness = { name: this.secondWitnessName(), signature };
      }
      const { place, patientIdentification } = this.form.getRawValue();
      const result = await this.consentService.sign(this.itemId, {
        place: place ?? '',
        patientIdentification: patientIdentification ?? '',
        patientSignature,
        witness,
        secondWitness,
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
