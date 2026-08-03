import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { Consent, TreatmentItemDetail } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ConsentService } from './consent.service';

const SIGNATURE_JPEG_QUALITY = 0.9;

@Component({
  selector: 'app-consent-sign',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.consentTitle' | transloco }} — {{ item()?.treatmentTypeName }}</h1>
      @if (signedConsent(); as consent) {
        <div class="consent-text">{{ consent.consentText }}</div>
        <img class="signature-image" [src]="signatureUrl(consent)" alt="" />
        <p class="signed-at">
          {{ 'treatments.signedAt' | transloco }} {{ consent.signedAt.substring(0, 10) }}
        </p>
      } @else {
        <div class="consent-text">{{ item()?.consentTemplate }}</div>
        @if (canEdit) {
          <canvas
            #signatureCanvas
            class="signature-canvas"
            width="600"
            height="200"
            (pointerdown)="onPointerDown($event, signatureCanvas)"
            (pointermove)="onPointerMove($event, signatureCanvas)"
            (pointerup)="onPointerUp()"
            (pointerleave)="onPointerUp()"
          ></canvas>
          <div class="signature-actions">
            <button mat-button [disabled]="signing()" (click)="clear(signatureCanvas)">
              {{ 'treatments.clearSignature' | transloco }}
            </button>
            <button
              mat-flat-button
              color="primary"
              [disabled]="!hasStrokes() || signing()"
              (click)="sign(signatureCanvas)"
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
      .signature-canvas {
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
        touch-action: none;
        max-width: 100%;
        display: block;
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
  protected readonly hasStrokes = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected readonly signedConsent = signal<Consent | null>(null);
  // Plain field, not a signal: matches the established pattern used by
  // TreatmentDetailComponent/PhotoGalleryComponent for the same read-only-vs-editable split —
  // permissions don't change mid-session, so a one-time check in ngOnInit is sufficient.
  protected canEdit = false;

  private itemId = '';
  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private canvasInitialized = false;

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

  // The canvas defaults to a transparent background, but JPEG has no alpha channel — exporting an
  // untouched canvas straight to JPEG renders transparent pixels as black, not white. Filling it
  // opaque white before the first stroke keeps the exported signature on a white background. Only
  // done once per canvas (guarded by `canvasInitialized`), since re-filling on every stroke's
  // pointerdown would erase earlier strokes of a multi-stroke signature.
  private ensureCanvasInitialized(canvas: HTMLCanvasElement): void {
    if (this.canvasInitialized) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.canvasInitialized = true;
  }

  protected onPointerDown(event: PointerEvent, canvas: HTMLCanvasElement): void {
    this.ensureCanvasInitialized(canvas);
    this.drawing = true;
    const rect = canvas.getBoundingClientRect();
    this.lastX = event.clientX - rect.left;
    this.lastY = event.clientY - rect.top;
  }

  protected onPointerMove(event: PointerEvent, canvas: HTMLCanvasElement): void {
    if (!this.drawing) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastX = x;
    this.lastY = y;
    this.hasStrokes.set(true);
  }

  protected onPointerUp(): void {
    this.drawing = false;
  }

  protected clear(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.canvasInitialized = true;
    this.hasStrokes.set(false);
  }

  protected async sign(canvas: HTMLCanvasElement): Promise<void> {
    this.signing.set(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', SIGNATURE_JPEG_QUALITY)
      );
      if (!blob) return;
      const consent = await this.consentService.sign(this.itemId, blob);
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
