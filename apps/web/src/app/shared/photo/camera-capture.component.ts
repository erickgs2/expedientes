import { Component, ElementRef, Input, OnDestroy, ViewChild, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@jsverse/transloco';

const MAX_CAPTURE_DIMENSION = 1920;
const JPEG_QUALITY = 0.9;

/**
 * Owns the camera plumbing only — `getUserMedia`, the native-camera `<input capture>` fallback,
 * the review/retake step and the downscale-to-JPEG encode — and knows nothing about tags, uploads
 * or data sources. Emits a ready-to-upload `Blob` via `captured`; the parent decides what to do
 * with it. Extracted from `PhotoCaptureComponent` so the product-photo screen can reuse the same
 * camera UI without dragging along the BEFORE/AFTER tagging and upload logic that only makes
 * sense for valoración/treatment photos.
 */
@Component({
  selector: 'app-camera-capture',
  standalone: true,
  imports: [MatIconModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <div class="camera-capture">
      <!-- Always in the DOM (never inside a branch): openCamera() clicks it from the button
           below, which only renders while inactive. The capture attribute asks iOS/Android for
           the camera app rather than the photo library. -->
      <input
        #fileInput
        type="file"
        accept="image/*"
        capture="environment"
        class="visually-hidden"
        (change)="onFileSelected($event)"
      />
      <!-- Same picker without the capture attribute, which is what makes the OS offer the photo
           library or file browser instead of opening the camera. Multi-select, because picking a
           batch of existing photos is the whole point of this path. -->
      <input
        #libraryInput
        type="file"
        accept="image/*"
        [multiple]="allowMultiple"
        class="visually-hidden"
        (change)="onLibrarySelected($event)"
      />
      @if (!active()) {
        <div class="source-buttons">
          <button class="add-photos" type="button" [disabled]="disabled" (click)="openCamera()">
            <mat-icon aria-hidden="true">photo_camera</mat-icon>
            <span>{{ 'valoracion.photos.addPhotos' | transloco }}</span>
          </button>
          <button
            class="add-photos"
            type="button"
            [disabled]="disabled || busy"
            (click)="libraryInput.click()"
          >
            <mat-icon aria-hidden="true">photo_library</mat-icon>
            <span>{{ 'valoracion.photos.uploadPhotos' | transloco }}</span>
          </button>
        </div>
        @if (cameraError()) {
          <p class="camera-error" role="alert">{{ 'valoracion.photos.cameraError' | transloco }}</p>
        }
      } @else {
        <div class="capture-panel">
          <div class="camera-view">
            @if (!reviewing()) {
              <video #videoEl autoplay playsinline muted></video>
              <div class="oval-guide"></div>
            } @else {
              <img [src]="reviewImageUrl" alt="" class="review-image" />
            }
            <!-- Close sits on the frame itself, the way a camera screen behaves, instead of
                 competing with the primary action in a row of look-alike buttons below. -->
            <button
              class="frame-close"
              type="button"
              [disabled]="busy"
              [attr.aria-label]="'valoracion.photos.closeCamera' | transloco"
              (click)="closeCamera()"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>

          @if (!reviewing()) {
            <!-- A shutter, not a labelled button: one unmistakable primary target, thumb-sized. -->
            <button
              class="shutter"
              type="button"
              [attr.aria-label]="'valoracion.photos.capture' | transloco"
              (click)="capture()"
            >
              <span class="shutter-inner"></span>
            </button>
          } @else {
            <div class="review-actions">
              <button
                class="review-secondary"
                type="button"
                [disabled]="busy"
                (click)="retake()"
              >
                <mat-icon aria-hidden="true">refresh</mat-icon>
                <span>{{ 'valoracion.photos.retake' | transloco }}</span>
              </button>
              <button
                class="review-primary"
                type="button"
                [disabled]="busy"
                (click)="useCapturedPhoto()"
              >
                @if (busy) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon aria-hidden="true">check</mat-icon>
                }
                <span>{{ 'valoracion.photos.usePhoto' | transloco }}</span>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .add-photos {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 20px;
        border: none;
        border-radius: 999px;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        appearance: none;
      }
      .add-photos:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .capture-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        max-width: 480px;
      }
      .camera-view {
        position: relative;
        width: 100%;
        max-width: 480px;
        aspect-ratio: 3 / 4;
        background: #000;
        overflow: hidden;
        border-radius: 16px;
      }
      .frame-close {
        position: absolute;
        top: 8px;
        right: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        cursor: pointer;
        appearance: none;
      }
      /* Round shutter with a ring, mirroring the platform camera so the primary action is
         unmistakable and comfortably thumb-sized. */
      .shutter {
        width: 68px;
        height: 68px;
        padding: 0;
        border: 3px solid var(--mat-sys-primary);
        border-radius: 50%;
        background: transparent;
        cursor: pointer;
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: transform 150ms ease-out;
      }
      .shutter:active {
        transform: scale(0.92);
      }
      .shutter-inner {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--mat-sys-primary);
      }
      .review-actions {
        display: flex;
        gap: 12px;
        width: 100%;
        max-width: 320px;
      }
      .review-secondary,
      .review-primary {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 48px;
        border-radius: 999px;
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        appearance: none;
      }
      .review-secondary {
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
        background: transparent;
        color: var(--mat-sys-on-surface);
      }
      .review-primary {
        border: none;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
      .review-secondary:disabled,
      .review-primary:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .camera-view video,
      .camera-view .review-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .oval-guide {
        position: absolute;
        top: 12%;
        /* left keeps the oval centred: (100 - width) / 2. border-box so the 3px border counts
           inside that width, otherwise it pushes the oval off-centre to the right. */
        box-sizing: border-box;
        left: 15%;
        width: 70%;
        height: 76%;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }
      .camera-actions {
        margin-top: 8px;
        display: flex;
        gap: 8px;
      }
      .source-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: center;
      }
      .camera-error {
        color: var(--mat-sys-error, #b3261e);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
    `,
  ],
})
export class CameraCaptureComponent implements OnDestroy {
  @Input() disabled = false;
  @Input() busy = false;
  /** False where the host keeps only one photo, such as a product's packaging shot. */
  @Input() allowMultiple = true;
  readonly captured = output<Blob>();

  // Public so a host can mirror the camera's open/closed state in its own chrome — the photo
  // wrapper uses it to show the BEFORE/AFTER toggle only while the camera panel is up.
  readonly active = signal(false);
  protected readonly reviewing = signal(false);
  protected readonly cameraError = signal(false);
  protected reviewImageUrl: string | null = null;

  @ViewChild('fileInput') private readonly fileInput?: ElementRef<HTMLInputElement>;

  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private reviewBlob: Blob | null = null;
  private requestingCamera = false;
  /**
   * Set at the very top of `ngOnDestroy`. `getUserMedia()` can still be pending (permission prompt,
   * camera warm-up) when the component is destroyed, so its continuation re-checks this before
   * assigning `this.stream` — otherwise the camera hardware would stay live on a dead component,
   * with no UI showing it, until a full page reload. Distinct from `requestingCamera`, which only
   * guards re-entrant taps on an instance that is still alive.
   */
  private destroyed = false;

  // A setter query (not a static `@ViewChild` read in `ngAfterViewInit`) because `#videoEl` is
  // conditionally rendered (`@if (!reviewing())`) — it appears and disappears as the user moves
  // between the live view and the review step, and this fires every time it does, reattaching the
  // still-open stream each time the live view reappears (e.g. after "Retake").
  @ViewChild('videoEl')
  set videoEl(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.videoElement = ref?.nativeElement ?? null;
    if (this.videoElement && this.stream) {
      this.videoElement.srcObject = this.stream;
      void this.videoElement.play();
    }
  }

  protected async openCamera(): Promise<void> {
    if (this.disabled || this.active() || this.stream || this.requestingCamera) return;
    this.requestingCamera = true;
    this.cameraError.set(false);
    // The live preview needs `navigator.mediaDevices`, which browsers only expose on a secure
    // origin (https, or localhost). Inside the native shell this app is loaded over plain http
    // from the clinic server, so it is undefined there — fall back to the device's own camera
    // app through the file input. The oval guide only exists in the live preview, so it is
    // unavailable on that path; moving the server to https brings it back with no code change.
    if (!navigator.mediaDevices?.getUserMedia) {
      this.requestingCamera = false;
      this.fileInput?.nativeElement.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (this.destroyed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.active.set(true);
    } catch (error) {
      console.error('Camera access failed', error);
      this.cameraError.set(true);
    } finally {
      this.requestingCamera = false;
    }
  }

  protected closeCamera(): void {
    this.stopStream();
    this.active.set(false);
    this.reviewing.set(false);
    this.discardReview();
  }

  protected capture(): void {
    const video = this.videoElement;
    if (!video) return;
    // The video element exists before its metadata loads, and a capture in that narrow window would
    // produce a 0x0 canvas.
    if (!video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(
      1,
      MAX_CAPTURE_DIMENSION / Math.max(video.videoWidth, video.videoHeight)
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // Two quick taps can put two `toBlob` calls in flight; without this, the second callback
        // would overwrite `reviewImageUrl` and leak the first one's object URL.
        this.discardReview();
        this.reviewBlob = blob;
        this.reviewImageUrl = URL.createObjectURL(blob);
        this.reviewing.set(true);
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  }

  protected retake(): void {
    this.discardReview();
    this.reviewing.set(false);
    // No stream means this photo came from the device's camera app, so there is no live view to
    // return to — close out and reopen it. Cancelling there lands back on "add photos" rather
    // than on an empty preview.
    if (!this.stream) {
      this.active.set(false);
      void this.openCamera();
    }
  }

  /**
   * Handles a photo coming back from the device's own camera app (the non-secure-origin
   * fallback) and drops the user straight into the same review step the live path uses.
   */
  /**
   * Photos picked from the library or file browser. These skip the review step entirely and are
   * emitted straight away: the user already chose them deliberately from a visual picker, so a
   * confirm-each-one step would just be in the way — and it would make selecting a batch tedious.
   *
   * Emitted one at a time, sequentially, because the host uploads each blob it receives.
   */
  protected async onLibrarySelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Cleared so picking the same file twice still fires `change`.
    input.value = '';
    if (files.length === 0) return;

    let anyFailed = false;
    for (const file of files) {
      const blob = await this.toJpegBlob(file);
      if (this.destroyed) return;
      if (!blob) {
        anyFailed = true;
        continue;
      }
      this.captured.emit(blob);
    }
    this.cameraError.set(anyFailed);
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Cleared so picking the same file twice still fires `change`.
    input.value = '';
    if (!file) return;
    const blob = await this.toJpegBlob(file);
    if (!blob) {
      this.cameraError.set(true);
      return;
    }
    if (this.destroyed) return;
    this.discardReview();
    this.reviewBlob = blob;
    this.reviewImageUrl = URL.createObjectURL(blob);
    this.active.set(true);
    this.reviewing.set(true);
  }

  /**
   * Re-encodes a picked photo to a downscaled JPEG, matching what the live capture path
   * produces. Always re-encodes rather than uploading the file untouched: iOS hands back HEIC
   * for camera shots on many devices, which the upload endpoint rejects (it verifies JPEG magic
   * bytes), and `imageOrientation: 'from-image'` bakes EXIF rotation into the pixels so a photo
   * taken sideways is not stored sideways.
   */
  private async toJpegBlob(file: File): Promise<Blob | null> {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY);
      });
    } catch (error) {
      console.error('Failed to process the selected photo', error);
      return null;
    }
  }

  protected useCapturedPhoto(): void {
    if (!this.reviewBlob) return;
    this.captured.emit(this.reviewBlob);
    this.discardReview();
    this.reviewing.set(false);
    // Return to the live view rather than closing, so a series of photos can be taken without
    // reopening the camera between each one — clinicians shoot several angles in a row. With no
    // stream the photo came from the device's camera app and there is no live view to return to,
    // so close out instead, the same way `retake` handles that case.
    if (!this.stream) {
      this.active.set(false);
    }
  }

  private discardReview(): void {
    if (this.reviewImageUrl) {
      URL.revokeObjectURL(this.reviewImageUrl);
    }
    this.reviewImageUrl = null;
    this.reviewBlob = null;
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopStream();
    this.discardReview();
  }
}
