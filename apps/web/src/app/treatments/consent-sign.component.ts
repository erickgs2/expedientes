import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { Consent, TreatmentItemDetail } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { SignaturePadComponent } from '../shared/signature-pad/signature-pad.component';
import { ConsentService } from './consent.service';

@Component({
  selector: 'app-consent-sign',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule, SignaturePadComponent],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.consentTitle' | transloco }} — {{ item()?.treatmentTypeName }}</h1>
      @if (signedConsent(); as consent) {
        <div class="consent-text">{{ consent.consentText }}</div>
        <img
          class="signature-image"
          [src]="signatureUrl(consent)"
          [alt]="'treatments.signatureAlt' | transloco"
        />
        <p class="signed-at">
          {{ 'treatments.signedAt' | transloco }} {{ consent.signedAt.substring(0, 10) }}
        </p>
      } @else {
        <div class="consent-text">{{ item()?.consentTemplate }}</div>
        @if (canEdit) {
          <app-signature-pad #patientPad [disabled]="signing()"></app-signature-pad>
          <div class="signature-actions">
            <button
              mat-flat-button
              color="primary"
              [disabled]="!patientPad.hasStrokes() || signing()"
              (click)="sign()"
            >
              {{ 'treatments.signAction' | transloco }}
            </button>
          </div>
        } @else {
          <p>{{ 'treatments.consentNotYetSigned' | transloco }}</p>
        }
      }
      <button mat-button (click)="back()">{{ 'common.back' | transloco }}</button>
    }
  `,
  styles: [
    `
      .consent-text {
        white-space: pre-wrap;
        margin: 12px 0;
        max-width: 600px;
      }
      .signature-actions {
        margin: 8px 0;
        display: flex;
        gap: 8px;
      }
      .signature-image {
        max-width: 600px;
        display: block;
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
      }
      .signed-at {
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
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

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly signing = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected readonly signedConsent = signal<Consent | null>(null);
  // Plain field, not a signal: matches the established pattern used by
  // TreatmentDetailComponent/PhotoGalleryComponent for the same read-only-vs-editable split —
  // permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;

  @ViewChild('patientPad') private patientPad?: SignaturePadComponent;

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
    } catch (error) {
      console.error('Failed to load treatment item', error);
      this.loadFailed.set(true);
    } finally {
      if (!mismatched) {
        this.loading.set(false);
      }
    }
  }

  protected async sign(): Promise<void> {
    if (!this.patientPad) return;
    this.signing.set(true);
    try {
      const blob = await this.patientPad.toJpegBlob();
      if (!blob) return;
      const templateUpdatedAt = this.item()?.consentTemplateUpdatedAt;
      if (!templateUpdatedAt) return;
      const consent = await this.consentService.sign(this.itemId, blob, templateUpdatedAt);
      this.signedConsent.set(consent);
    } finally {
      this.signing.set(false);
    }
  }

  protected signatureUrl(consent: Consent): string {
    return `/api/files/${consent.signatureImagePath}`;
  }

  protected back(): void {
    const treatmentId = this.item()?.treatmentId;
    this.router.navigate(treatmentId ? ['/treatments', treatmentId] : ['/treatments']);
  }
}
