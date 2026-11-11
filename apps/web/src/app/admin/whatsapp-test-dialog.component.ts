import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import type { WhatsAppSendResponse, WhatsAppTestKind } from '@expedientes/shared-types';
import { ClinicSettingsService } from './clinic-settings.service';

export interface WhatsAppTestDialogData {
  /** The settings form has edits that are not saved yet; the test uses what is stored. */
  unsavedChanges: boolean;
  notificationsEnabled: boolean;
}

/**
 * Sends the stored confirmation or reminder template to a number typed here, with sample values,
 * so the clinic can check credentials and templates in any environment before switching messages
 * on for real patients. Stays open after a send so several numbers or both templates can be tried.
 */
@Component({
  selector: 'app-whatsapp-test-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'clinicSettings.whatsapp.test.title' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="send()">
      <mat-dialog-content>
        <p class="hint">{{ 'clinicSettings.whatsapp.test.help' | transloco }}</p>
        @if (!data.notificationsEnabled) {
          <p class="notice">
            <mat-icon aria-hidden="true">notifications_off</mat-icon>
            {{ 'clinicSettings.whatsapp.test.switchOff' | transloco }}
          </p>
        }
        @if (data.unsavedChanges) {
          <p class="notice">
            <mat-icon aria-hidden="true">info</mat-icon>
            {{ 'clinicSettings.whatsapp.test.unsaved' | transloco }}
          </p>
        }

        <p class="field-label" id="wa-test-kind">{{ 'clinicSettings.whatsapp.test.kind' | transloco }}</p>
        <mat-button-toggle-group
          formControlName="kind"
          aria-labelledby="wa-test-kind"
          class="kind-toggle"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="confirmation">
            {{ 'clinicSettings.whatsapp.test.confirmation' | transloco }}
          </mat-button-toggle>
          <mat-button-toggle value="reminder">
            {{ 'clinicSettings.whatsapp.test.reminder' | transloco }}
          </mat-button-toggle>
        </mat-button-toggle-group>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'clinicSettings.whatsapp.test.phone' | transloco }}</mat-label>
          <input matInput type="tel" inputmode="tel" autocomplete="off" formControlName="phone" />
          <mat-hint>{{ 'clinicSettings.whatsapp.test.phoneHint' | transloco }}</mat-hint>
        </mat-form-field>

        <div class="result" aria-live="polite">
          @if (outcome(); as o) {
            <p [class.ok]="o.result === 'sent'" [class.fail]="o.result !== 'sent'">
              <mat-icon aria-hidden="true">{{ o.result === 'sent' ? 'check_circle' : 'error' }}</mat-icon>
              <span>{{ 'clinicSettings.whatsapp.test.result.' + o.result | transloco }}</span>
            </p>
            @if (o.detail) {
              <pre class="detail">{{ o.detail }}</pre>
            }
          } @else if (requestFailed()) {
            <p class="fail">
              <mat-icon aria-hidden="true">error</mat-icon>
              <span>{{ 'clinicSettings.whatsapp.test.requestFailed' | transloco }}</span>
            </p>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>
          {{ 'clinicSettings.whatsapp.test.close' | transloco }}
        </button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || sending()">
          <mat-icon>send</mat-icon>
          {{ (sending() ? 'clinicSettings.whatsapp.test.sending' : 'clinicSettings.whatsapp.test.send') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .hint {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .notice {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin: 0 0 16px;
        padding: 10px 12px;
        border: 1px solid var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
      .field-label {
        margin: 0 0 6px;
        font-weight: 500;
      }
      .kind-toggle {
        margin-bottom: 20px;
      }
      .result p {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 8px 0 0;
        font-weight: 500;
      }
      .result .fail {
        color: var(--mat-sys-error);
      }
      .detail {
        margin: 8px 0 0;
        padding: 8px 10px;
        max-height: 140px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        border: 1px solid var(--plate-line);
        border-radius: 6px;
        background: var(--mat-sys-surface-container-low);
      }
    `,
  ],
})
export class WhatsAppTestDialogComponent {
  protected readonly data = inject<WhatsAppTestDialogData>(MAT_DIALOG_DATA);
  private readonly clinicSettingsService = inject(ClinicSettingsService);
  private readonly fb = inject(FormBuilder);

  protected readonly sending = signal(false);
  protected readonly outcome = signal<WhatsAppSendResponse | null>(null);
  protected readonly requestFailed = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    kind: ['confirmation' as WhatsAppTestKind, Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^[\d\s()+-]{10,20}$/)]],
  });

  protected async send(): Promise<void> {
    if (this.form.invalid || this.sending()) return;
    this.sending.set(true);
    this.outcome.set(null);
    this.requestFailed.set(false);
    try {
      const { kind, phone } = this.form.getRawValue();
      this.outcome.set(await this.clinicSettingsService.testWhatsApp({ kind, phone }));
    } catch (error) {
      console.error('WhatsApp test request failed', error);
      this.requestFailed.set(true);
    } finally {
      this.sending.set(false);
    }
  }
}
