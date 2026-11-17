import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { ClinicSettings, ClinicSettingsInput } from '@expedientes/shared-types';
import {
  DEFAULT_DECLARATION_AFTER,
  DEFAULT_DECLARATION_BEFORE,
  interpolateConsentText,
} from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { SignaturePadComponent } from '../shared/signature-pad/signature-pad.component';
import { ClinicSettingsService } from './clinic-settings.service';
import {
  WhatsAppTestDialogComponent,
  type WhatsAppTestDialogData,
} from './whatsapp-test-dialog.component';

type DeclarationField = 'declarationBefore' | 'declarationAfter';

/** The markers a declaration may use, with the label shown on its insert button. */
const PLACEHOLDERS = [
  { key: 'patientName', label: 'clinicSettings.placeholders.patientName' },
  { key: 'doctorTitle', label: 'clinicSettings.placeholders.doctorTitle' },
  { key: 'doctorName', label: 'clinicSettings.placeholders.doctorName' },
  { key: 'doctorLicense', label: 'clinicSettings.placeholders.doctorLicense' },
  { key: 'clinicName', label: 'clinicSettings.placeholders.clinicName' },
] as const;

/**
 * Clinic settings: what prints on every consent and on the exported record, plus WhatsApp.
 *
 * A row of status cards says at a glance what is still missing (a consent cannot be signed without
 * the physician's name and cédula). Beside the editor, a live preview shows a consent page built
 * with the same marker filling the signed document uses, so wording is checked before saving.
 * WhatsApp is laid out as connect → templates → test, with the switch for real patients on top.
 * One save covers everything, from a bar that stays in view while there are changes.
 */
@Component({
  selector: 'app-clinic-settings',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    TranslocoModule,
    SignaturePadComponent,
  ],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <header class="page-head">
        <h1>{{ 'clinicSettings.title' | transloco }}</h1>
        <p>{{ 'clinicSettings.subtitle' | transloco }}</p>
      </header>

      <section class="status" [attr.aria-label]="'clinicSettings.status.label' | transloco">
        @for (card of statusCards(); track card.key) {
          <button
            type="button"
            class="status-card"
            [class.is-missing]="card.state === 'missing'"
            [class.is-muted]="card.state === 'muted'"
            (click)="scrollTo(card.target)"
          >
            <span class="status-label">
              @if (card.state === 'missing') {
                <span class="dot" aria-hidden="true"></span>
              }
              {{ 'clinicSettings.status.' + card.key | transloco }}
            </span>
            <span class="status-value">
              @if (card.state === 'ok') {
                <mat-icon aria-hidden="true">check</mat-icon>
              }
              {{ card.valueKey | transloco }}
            </span>
          </button>
        }
      </section>

      <form [formGroup]="form" (ngSubmit)="save()">
        <div class="split">
          <div class="editor">
            <section id="cs-doctor" class="card">
              <h2>{{ 'clinicSettings.identity' | transloco }}</h2>
              <p class="hint">{{ 'clinicSettings.doctorHelp' | transloco }}</p>
              <div class="doctor-grid">
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clinicSettings.doctorTitle' | transloco }}</mat-label>
                  <input matInput formControlName="doctorTitle" placeholder="Dra." />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clinicSettings.doctorName' | transloco }}</mat-label>
                  <input matInput formControlName="doctorName" />
                </mat-form-field>
              </div>
              <div class="two">
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clinicSettings.doctorLicense' | transloco }}</mat-label>
                  <input matInput formControlName="doctorLicense" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clinicSettings.defaultPlace' | transloco }}</mat-label>
                  <input matInput formControlName="defaultPlace" />
                </mat-form-field>
              </div>
            </section>

            <section id="cs-assets" class="card">
              <h2>{{ 'clinicSettings.assetsTitle' | transloco }}</h2>
              <div class="assets">
                <div class="asset">
                  <p class="asset-label">{{ 'clinicSettings.logo' | transloco }}</p>
                  @if (logoPreviewUrl(); as preview) {
                    <img class="logo-image" [src]="preview" [alt]="'clinicSettings.logo' | transloco" />
                  } @else {
                    <div class="asset-empty">{{ 'clinicSettings.noLogo' | transloco }}</div>
                  }
                  @if (canEdit) {
                    <input
                      #logoInput
                      type="file"
                      accept="image/png,image/jpeg"
                      class="visually-hidden"
                      (change)="onLogoSelected($event)"
                    />
                    <button mat-stroked-button type="button" [disabled]="saving()" (click)="logoInput.click()">
                      <mat-icon>image</mat-icon>
                      {{ (logoPreviewUrl() ? 'clinicSettings.replaceLogo' : 'clinicSettings.uploadLogo') | transloco }}
                    </button>
                  }
                  <p class="hint small">{{ 'clinicSettings.logoHelp' | transloco }}</p>
                </div>
                <div class="asset">
                  <p class="asset-label">{{ 'clinicSettings.doctorSignature' | transloco }}</p>
                  @if (currentSignaturePath() && !drawingSignature()) {
                    <img
                      class="signature-image"
                      [src]="fileUrl(currentSignaturePath()!)"
                      [alt]="'clinicSettings.doctorSignature' | transloco"
                    />
                    @if (canEdit) {
                      <button mat-stroked-button type="button" (click)="drawingSignature.set(true)">
                        <mat-icon>draw</mat-icon>{{ 'clinicSettings.replaceSignature' | transloco }}
                      </button>
                    }
                  }
                  <div [hidden]="!!currentSignaturePath() && !drawingSignature()">
                    <app-signature-pad #signaturePad [disabled]="saving() || !canEdit"></app-signature-pad>
                    @if (currentSignaturePath() && drawingSignature()) {
                      <button mat-button type="button" (click)="cancelSignature()">
                        {{ 'clinicSettings.keepSignature' | transloco }}
                      </button>
                    }
                  </div>
                </div>
              </div>
            </section>

            <section id="cs-declarations" class="card">
              <div class="card-head">
                <h2>{{ 'clinicSettings.declarationsTitle' | transloco }}</h2>
                @if (canEdit) {
                  <button mat-stroked-button type="button" (click)="restoreSuggestedDeclarations()">
                    <mat-icon>restart_alt</mat-icon>{{ 'clinicSettings.restoreSuggested' | transloco }}
                  </button>
                }
              </div>
              @if (canEdit) {
                <div class="inserts" role="group" [attr.aria-label]="'clinicSettings.insertLabel' | transloco">
                  <span class="hint small">{{ 'clinicSettings.insertLabel' | transloco }}</span>
                  @for (ph of placeholders; track ph.key) {
                    <button type="button" class="insert" (mousedown)="$event.preventDefault()" (click)="insertPlaceholder(ph.key)">
                      {{ ph.label | transloco }}
                    </button>
                  }
                </div>
              }
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.declarationBefore' | transloco }}</mat-label>
                <textarea
                  #beforeArea
                  matInput
                  formControlName="declarationBefore"
                  rows="5"
                  [placeholder]="defaultDeclarationBefore"
                  (focus)="lastDeclaration = 'declarationBefore'"
                ></textarea>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.declarationAfter' | transloco }}</mat-label>
                <textarea
                  #afterArea
                  matInput
                  formControlName="declarationAfter"
                  rows="8"
                  [placeholder]="defaultDeclarationAfter"
                  (focus)="lastDeclaration = 'declarationAfter'"
                ></textarea>
              </mat-form-field>
              <p class="hint small">{{ 'clinicSettings.signedUnaffected' | transloco }}</p>
            </section>
          </div>

          <aside class="preview-col" [attr.aria-label]="'clinicSettings.preview.label' | transloco">
            <div class="preview-head">
              <h2>{{ 'clinicSettings.preview.title' | transloco }}</h2>
              <span class="hint small">{{ 'clinicSettings.preview.sample' | transloco }}</span>
            </div>
            <!-- Always Spanish: a consent is signed and printed in Spanish whatever the UI language. -->
            <div class="paper" lang="es">
              <div class="paper-logo">
                @if (logoPreviewUrl(); as preview) {
                  <img [src]="preview" alt="" />
                } @else {
                  <span>LOGOTIPO</span>
                }
              </div>
              <p class="paper-title">CONSENTIMIENTO INFORMADO</p>
              <dl class="paper-fields">
                <dt>LUGAR</dt><dd>{{ value().defaultPlace || '—' }}</dd>
                <dt>FECHA</dt><dd>{{ previewDate }}</dd>
                <dt>PACIENTE</dt><dd>{{ samplePatient }}</dd>
              </dl>
              <p class="paper-text">{{ previewBefore() }}</p>
              <p class="paper-sections">PROCEDIMIENTO · RIESGOS Y COMPLICACIONES · ALTERNATIVAS · CUIDADOS POSTERIORES</p>
              <p class="paper-text">{{ previewAfter() }}</p>
              <div class="paper-signatures">
                <div>
                  <div class="sig-line"></div>
                  <p>PACIENTE</p>
                </div>
                <div>
                  <div class="sig-line">
                    @if (currentSignaturePath() && !drawingSignature()) {
                      <img [src]="fileUrl(currentSignaturePath()!)" alt="" />
                    } @else if (!pad()?.hasStrokes()) {
                      <span class="missing">{{ 'clinicSettings.preview.noSignature' | transloco }}</span>
                    }
                  </div>
                  <p>MEDICO</p>
                  <p class="sub">{{ value().doctorTitle }} {{ value().doctorName }} CED {{ value().doctorLicense }}</p>
                </div>
              </div>
            </div>
            <p class="hint small">{{ 'clinicSettings.preview.note' | transloco }}</p>
          </aside>
        </div>

        <section id="cs-whatsapp" class="card wa">
          <div class="card-head">
            <div>
              <h2>{{ 'clinicSettings.whatsapp.title' | transloco }}</h2>
              <p class="hint">{{ 'clinicSettings.whatsapp.help' | transloco }}</p>
            </div>
            <mat-slide-toggle formControlName="whatsappNotificationsEnabled">
              {{ 'clinicSettings.whatsapp.enabled' | transloco }}
            </mat-slide-toggle>
          </div>
          <p class="hint">
            {{
              (value().whatsappNotificationsEnabled
                ? 'clinicSettings.whatsapp.enabledOn'
                : 'clinicSettings.whatsapp.enabledOff'
              ) | transloco
            }}
          </p>
          <ol class="wa-steps">
            <li class="wa-step">
              <h3>
                @if (whatsappConnected()) {
                  <mat-icon aria-hidden="true">check</mat-icon>
                }
                {{ 'clinicSettings.whatsapp.step1' | transloco }}
              </h3>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.whatsapp.phoneNumberId' | transloco }}</mat-label>
                <input matInput formControlName="whatsappPhoneNumberId" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.whatsapp.accessToken' | transloco }}</mat-label>
                <input
                  matInput
                  type="password"
                  autocomplete="off"
                  formControlName="whatsappAccessToken"
                  [placeholder]="
                    (currentSettings()?.whatsappAccessTokenSet
                      ? 'clinicSettings.whatsapp.tokenStored'
                      : 'clinicSettings.whatsapp.tokenMissing'
                    ) | transloco
                  "
                />
                <mat-hint>{{ 'clinicSettings.whatsapp.tokenHint' | transloco }}</mat-hint>
              </mat-form-field>
              @if (currentSettings()?.whatsappAccessTokenSet && canEdit) {
                <button mat-button type="button" (click)="clearAccessToken()">
                  <mat-icon>key_off</mat-icon>{{ 'clinicSettings.whatsapp.clearToken' | transloco }}
                </button>
                @if (clearingAccessToken()) {
                  <p class="hint small">{{ 'clinicSettings.whatsapp.clearPending' | transloco }}</p>
                }
              }
            </li>
            <li class="wa-step">
              <h3>{{ 'clinicSettings.whatsapp.step2' | transloco }}</h3>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.whatsapp.confirmationTemplate' | transloco }}</mat-label>
                <input matInput formControlName="whatsappConfirmationTemplate" placeholder="appointment_confirmation" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.whatsapp.reminderTemplate' | transloco }}</mat-label>
                <input matInput formControlName="whatsappReminderTemplate" placeholder="appointment_reminder" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'clinicSettings.whatsapp.templateLanguage' | transloco }}</mat-label>
                <input matInput formControlName="whatsappTemplateLanguage" placeholder="es_MX" />
              </mat-form-field>
              <p class="hint small">{{ 'clinicSettings.whatsapp.paramsHint' | transloco }}</p>
            </li>
            <li class="wa-step is-test">
              <h3>{{ 'clinicSettings.whatsapp.step3' | transloco }}</h3>
              <p class="hint">{{ 'clinicSettings.whatsapp.test.openHelp' | transloco }}</p>
              @if (canEdit) {
                <button mat-flat-button color="primary" type="button" (click)="openWhatsAppTest()">
                  <mat-icon>send_to_mobile</mat-icon>{{ 'clinicSettings.whatsapp.test.open' | transloco }}
                </button>
              }
            </li>
          </ol>
        </section>

        @if (canEdit) {
          <div class="save-bar" [class.has-changes]="hasChanges()">
            <span class="save-state" aria-live="polite">
              {{ (hasChanges() ? 'clinicSettings.unsaved' : 'clinicSettings.allSaved') | transloco }}
            </span>
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving() || !hasChanges()">
              {{ 'common.save' | transloco }}
            </button>
          </div>
        }
      </form>
    }
  `,
  styles: [
    `
      .page-head h1 {
        margin: 0;
      }
      .page-head p {
        margin: 2px 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .status {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      .status-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: 56px;
        padding: 14px 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .status-card:hover,
      .status-card:focus-visible {
        border-color: var(--plate-line-strong);
        background: var(--mat-sys-surface-container-low);
      }
      .status-card.is-missing {
        border-color: var(--plate-mark);
      }
      .status-card.is-muted {
        border-style: dashed;
        border-color: var(--plate-line-strong);
      }
      .status-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .is-missing .status-label {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .status-value {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 600;
      }
      .status-value mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .split {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        align-items: flex-start;
      }
      .editor {
        flex: 1 1 440px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .preview-col {
        flex: 1 1 400px;
        min-width: 0;
        position: sticky;
        top: 80px;
      }
      .card {
        padding: 20px 24px;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        scroll-margin-top: 80px;
      }
      .card h2,
      .preview-head h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }
      .card-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px 12px;
        margin-bottom: 12px;
      }
      .hint {
        margin: 2px 0 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .hint.small {
        font-size: 12px;
        margin: 4px 0 0;
      }
      .full-width {
        width: 100%;
      }
      .doctor-grid {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 0 12px;
      }
      .two {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0 12px;
      }
      .assets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 20px;
        margin-top: 12px;
      }
      .asset {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
      }
      .asset > div {
        width: 100%;
      }
      .asset-label {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .asset-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 80px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        text-align: center;
      }
      .logo-image {
        max-width: 100%;
        max-height: 100px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 6px;
        /* Checkerboard so a transparent PNG reads as transparent rather than as a white block. */
        background:
          repeating-conic-gradient(rgba(0, 0, 0, 0.06) 0% 25%, transparent 0% 50%) 50% / 16px 16px;
      }
      .signature-image {
        max-width: 100%;
        max-height: 100px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 6px;
        background: #fff;
      }
      .inserts {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
      }
      .inserts .hint {
        margin: 0 4px 0 0;
      }
      .insert {
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 18px;
        background: var(--mat-sys-surface-container-low);
        color: inherit;
        font: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      .preview-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      /* A sheet of letter paper: always white ink-on-paper, in light and dark theme alike. */
      .paper {
        box-sizing: border-box;
        aspect-ratio: 8.5 / 11;
        overflow: hidden;
        padding: 32px 36px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 4px;
        background: #ffffff;
        color: #1c1c19;
        font-size: 10.5px;
        line-height: 1.55;
        -webkit-mask-image: linear-gradient(to bottom, #000 88%, transparent);
        mask-image: linear-gradient(to bottom, #000 88%, transparent);
      }
      .paper-logo {
        display: flex;
        justify-content: center;
        margin-bottom: 14px;
      }
      .paper-logo img {
        max-height: 44px;
        max-width: 60%;
      }
      .paper-logo span {
        padding: 10px 24px;
        border: 1px dashed rgba(28, 28, 25, 0.32);
        color: #42474e;
        font-weight: 600;
      }
      .paper-title {
        margin: 0 0 10px;
        text-align: center;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .paper-fields {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 2px 10px;
        margin: 0 0 10px;
      }
      .paper-fields dt {
        font-weight: 700;
      }
      .paper-fields dd {
        margin: 0;
      }
      .paper-text {
        margin: 0 0 10px;
        white-space: pre-line;
      }
      .paper-sections {
        margin: 0 0 10px;
        padding: 6px 8px;
        border: 1px dashed rgba(28, 28, 25, 0.32);
        color: #42474e;
        font-size: 9.5px;
      }
      .paper-signatures {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 20px;
        margin-top: 18px;
        text-align: center;
      }
      .paper-signatures p {
        margin: 3px 0 0;
        font-weight: 700;
      }
      .paper-signatures .sub {
        font-weight: 400;
      }
      .sig-line {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: 44px;
        border-bottom: 1px solid #1c1c19;
      }
      .sig-line img {
        max-height: 42px;
        max-width: 90%;
      }
      .sig-line .missing {
        color: #af0641;
        font-weight: 600;
      }
      .wa {
        margin-top: 24px;
      }
      .wa-steps {
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .wa-step {
        padding: 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
      }
      .wa-step.is-test {
        border-color: var(--plate-mark);
      }
      .wa-step h3 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 600;
      }
      .wa-step h3 mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .save-bar {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 24px;
        padding: 12px 16px;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
      }
      .save-bar.has-changes {
        border-color: var(--plate-mark);
      }
      .save-state {
        flex: 1;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .has-changes .save-state {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      @media (max-width: 939px) {
        .preview-col {
          position: static;
        }
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
  private readonly dialog = inject(MatDialog);

  protected readonly pad = viewChild<SignaturePadComponent>('signaturePad');
  private readonly beforeArea = viewChild<ElementRef<HTMLTextAreaElement>>('beforeArea');
  private readonly afterArea = viewChild<ElementRef<HTMLTextAreaElement>>('afterArea');

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly currentSignaturePath = signal<string | null>(null);
  protected readonly drawingSignature = signal(false);
  // Either the stored logo's served URL or an object URL for a file picked but not yet saved, so
  // the preview always shows what pressing Guardar would produce.
  protected readonly logoPreviewUrl = signal<string | null>(null);
  protected readonly currentSettings = signal<ClinicSettings | null>(null);
  protected readonly clearingAccessToken = signal(false);
  private readonly pendingLogo = signal<File | null>(null);
  private pendingLogoObjectUrl: string | null = null;
  // Permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;

  protected readonly defaultDeclarationBefore = DEFAULT_DECLARATION_BEFORE;
  protected readonly defaultDeclarationAfter = DEFAULT_DECLARATION_AFTER;
  protected readonly placeholders = PLACEHOLDERS;
  protected lastDeclaration: DeclarationField = 'declarationBefore';

  protected readonly samplePatient = 'NOMBRE DEL PACIENTE';
  protected readonly previewDate = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  protected readonly form = this.fb.nonNullable.group({
    defaultPlace: ['', Validators.required],
    doctorTitle: ['', Validators.required],
    doctorName: ['', Validators.required],
    doctorLicense: ['', Validators.required],
    whatsappPhoneNumberId: [''],
    whatsappAccessToken: [''],
    whatsappConfirmationTemplate: [''],
    whatsappReminderTemplate: [''],
    whatsappTemplateLanguage: [''],
    whatsappNotificationsEnabled: [false],
    declarationBefore: ['', Validators.required],
    declarationAfter: ['', Validators.required],
  });

  /** The form's live values, so the status cards and the preview follow every keystroke. */
  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** Bumped on save/load, since `form.dirty` itself is not a signal. */
  private readonly pristineTick = signal(0);

  private readonly interpolationValues = computed(() => {
    const v = this.value();
    return {
      patientName: this.samplePatient,
      doctorTitle: v.doctorTitle ?? '',
      doctorName: v.doctorName ?? '',
      doctorLicense: v.doctorLicense ?? '',
      clinicName: this.currentSettings()?.clinicName ?? '',
    };
  });
  protected readonly previewBefore = computed(() =>
    interpolateConsentText(this.value().declarationBefore || DEFAULT_DECLARATION_BEFORE, this.interpolationValues())
  );
  protected readonly previewAfter = computed(() =>
    interpolateConsentText(this.value().declarationAfter || DEFAULT_DECLARATION_AFTER, this.interpolationValues())
  );

  protected readonly whatsappConnected = computed(
    () =>
      !!this.value().whatsappPhoneNumberId?.trim() &&
      (!!this.currentSettings()?.whatsappAccessTokenSet || !!this.value().whatsappAccessToken?.trim()) &&
      !this.clearingAccessToken()
  );

  protected readonly hasChanges = computed(() => {
    this.value();
    this.pristineTick();
    return (
      this.form.dirty ||
      this.pendingLogo() !== null ||
      this.clearingAccessToken() ||
      !!this.pad()?.hasStrokes()
    );
  });

  protected readonly statusCards = computed(() => {
    const v = this.value();
    const hasSignature =
      (!!this.currentSignaturePath() && !this.drawingSignature()) || !!this.pad()?.hasStrokes();
    const declarationsSuggested =
      v.declarationBefore === DEFAULT_DECLARATION_BEFORE && v.declarationAfter === DEFAULT_DECLARATION_AFTER;
    const declarationsReady = !!v.declarationBefore?.trim() && !!v.declarationAfter?.trim();
    const doctorReady = !!v.doctorName?.trim() && !!v.doctorLicense?.trim();
    type State = 'ok' | 'missing' | 'muted';
    const card = (key: string, target: string, state: State, valueKey: string) => ({
      key,
      target,
      state,
      valueKey: `clinicSettings.status.values.${valueKey}`,
    });
    return [
      card('logo', 'cs-assets', this.logoPreviewUrl() ? 'ok' : 'missing', this.logoPreviewUrl() ? 'logoOk' : 'logoMissing'),
      card('doctor', 'cs-doctor', doctorReady ? 'ok' : 'missing', doctorReady ? 'doctorOk' : 'doctorMissing'),
      card(
        'declarations',
        'cs-declarations',
        declarationsReady ? 'ok' : 'missing',
        !declarationsReady ? 'declarationsMissing' : declarationsSuggested ? 'declarationsSuggested' : 'declarationsCustom'
      ),
      card('signature', 'cs-assets', hasSignature ? 'ok' : 'missing', hasSignature ? 'signatureOk' : 'signatureMissing'),
      card(
        'whatsapp',
        'cs-whatsapp',
        this.whatsappConnected() && v.whatsappNotificationsEnabled ? 'ok' : 'muted',
        !this.whatsappConnected() ? 'whatsappNotConfigured' : v.whatsappNotificationsEnabled ? 'whatsappOn' : 'whatsappOff'
      ),
    ];
  });

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission('clinic-settings', 'edit');
    try {
      const settings = await this.clinicSettingsService.get();
      this.applySettings(settings);
      if (!this.canEdit) this.form.disable();
    } catch (error) {
      console.error('Failed to load clinic settings', error);
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private applySettings(settings: ClinicSettings | null): void {
    this.currentSettings.set(settings);
    this.clearingAccessToken.set(false);
    this.drawingSignature.set(false);
    this.currentSignaturePath.set(settings?.doctorSignaturePath ?? null);
    // A file picked but not yet saved wins over the stored one, so reloading settings mid-edit
    // doesn't silently discard the user's pending choice.
    if (!this.pendingLogo()) {
      this.logoPreviewUrl.set(settings?.clinicLogoPath ? this.fileUrl(settings.clinicLogoPath) : null);
    }
    this.form.patchValue({
      defaultPlace: settings?.defaultPlace ?? '',
      doctorTitle: settings?.doctorTitle ?? '',
      doctorName: settings?.doctorName ?? '',
      doctorLicense: settings?.doctorLicense ?? '',
      whatsappPhoneNumberId: settings?.whatsappPhoneNumberId ?? '',
      // Never populated: the token is write-only, so the field stays blank and an untouched save
      // leaves whatever is stored alone.
      whatsappAccessToken: '',
      whatsappConfirmationTemplate: settings?.whatsappConfirmationTemplate ?? '',
      whatsappReminderTemplate: settings?.whatsappReminderTemplate ?? '',
      whatsappTemplateLanguage: settings?.whatsappTemplateLanguage ?? '',
      whatsappNotificationsEnabled: settings?.whatsappNotificationsEnabled ?? false,
      declarationBefore: settings?.declarationBefore ?? '',
      declarationAfter: settings?.declarationAfter ?? '',
    });
    this.form.markAsPristine();
    this.pristineTick.update((n) => n + 1);
  }

  protected fileUrl(path: string): string {
    return `/api/files/${path}`;
  }

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Inserts `{{key}}` at the cursor of the declaration last focused. */
  protected insertPlaceholder(key: string): void {
    const field = this.lastDeclaration;
    const area = (field === 'declarationBefore' ? this.beforeArea() : this.afterArea())?.nativeElement;
    const control = this.form.controls[field];
    const current = control.value ?? '';
    const token = `{{${key}}}`;
    const start = area?.selectionStart ?? current.length;
    const end = area?.selectionEnd ?? current.length;
    control.setValue(current.slice(0, start) + token + current.slice(end));
    control.markAsDirty();
    // Put the cursor after the inserted marker.
    queueMicrotask(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(start + token.length, start + token.length);
    });
  }

  /**
   * Arms removal of the stored token; it is only actually cleared when the form is saved, so this
   * follows the same "nothing happens until Guardar" rule as every other field here.
   */
  protected clearAccessToken(): void {
    this.clearingAccessToken.set(true);
    this.form.patchValue({ whatsappAccessToken: '' });
    this.form.markAsDirty();
  }

  protected cancelSignature(): void {
    this.pad()?.clear();
    this.drawingSignature.set(false);
  }

  protected openWhatsAppTest(): void {
    this.dialog.open<WhatsAppTestDialogComponent, WhatsAppTestDialogData>(WhatsAppTestDialogComponent, {
      data: {
        unsavedChanges: this.hasChanges(),
        notificationsEnabled: this.currentSettings()?.whatsappNotificationsEnabled ?? false,
      },
      width: '520px',
      maxWidth: '95vw',
    });
  }

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Clear the input's value so picking the same file twice in a row still fires `change`.
    input.value = '';
    if (!file) return;
    this.releasePendingLogoUrl();
    this.pendingLogo.set(file);
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
   * stored until Guardar, and it never touches a consent that has already been signed.
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
        defaultPlace: raw.defaultPlace,
        doctorTitle: raw.doctorTitle,
        doctorName: raw.doctorName,
        doctorLicense: raw.doctorLicense,
        whatsappPhoneNumberId: raw.whatsappPhoneNumberId,
        whatsappConfirmationTemplate: raw.whatsappConfirmationTemplate,
        whatsappReminderTemplate: raw.whatsappReminderTemplate,
        whatsappTemplateLanguage: raw.whatsappTemplateLanguage,
        whatsappNotificationsEnabled: raw.whatsappNotificationsEnabled ? 'true' : 'false',
        declarationBefore: raw.declarationBefore,
        declarationAfter: raw.declarationAfter,
      };
      const pad = this.pad();
      const signature = pad?.hasStrokes() ? await pad.toJpegBlob() : null;
      const settings = await this.clinicSettingsService.save(
        input,
        signature,
        this.pendingLogo(),
        raw.whatsappAccessToken,
        this.clearingAccessToken()
      );
      // Clear the pending file first so `applySettings` adopts the stored logo's URL, then release
      // the object URL the preview was using.
      this.pendingLogo.set(null);
      this.applySettings(settings);
      this.releasePendingLogoUrl();
      pad?.clear();
      this.snackBar.open(this.transloco.translate('clinicSettings.saved'), undefined, { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }
}
