import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import type { Photo, PhotoTag } from '@expedientes/shared-types';
import { ValoracionService } from '../valoracion.service';

const MAX_CAPTURE_DIMENSION = 1920;
const JPEG_QUALITY = 0.9;

@Component({
  selector: 'app-photo-capture',
  standalone: true,
  imports: [MatButtonModule, MatButtonToggleModule, TranslocoModule],
  template: `
    <div class="photo-capture">
      @if (!active()) {
        <button mat-flat-button color="primary" type="button" (click)="openCamera()">
          {{ 'valoracion.photos.addPhotos' | transloco }}
        </button>
        @if (cameraError()) {
          <p class="camera-error">{{ 'valoracion.photos.cameraError' | transloco }}</p>
        }
      } @else {
        <div class="camera-view">
          @if (!reviewing()) {
            <video #videoEl autoplay playsinline muted></video>
            <div class="oval-guide"></div>
          } @else {
            <img [src]="reviewImageUrl" alt="" class="review-image" />
          }
        </div>

        @if (!reviewing()) {
          <mat-button-toggle-group [value]="tag()">
            <mat-button-toggle value="BEFORE" (click)="setTag('BEFORE')">
              {{ 'valoracion.photos.before' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="AFTER" (click)="setTag('AFTER')">
              {{ 'valoracion.photos.after' | transloco }}
            </mat-button-toggle>
          </mat-button-toggle-group>
          <div class="camera-actions">
            <button mat-stroked-button type="button" (click)="closeCamera()">
              {{ 'valoracion.photos.closeCamera' | transloco }}
            </button>
            <button mat-flat-button color="primary" type="button" (click)="capture()">
              {{ 'valoracion.photos.capture' | transloco }}
            </button>
          </div>
        } @else {
          <div class="camera-actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="uploading()"
              (click)="retake()"
            >
              {{ 'valoracion.photos.retake' | transloco }}
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="uploading()"
              (click)="usePhoto()"
            >
              {{ 'valoracion.photos.usePhoto' | transloco }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .camera-view {
        position: relative;
        width: 100%;
        max-width: 480px;
        aspect-ratio: 3 / 4;
        background: #000;
        overflow: hidden;
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
        left: 25%;
        width: 50%;
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
      .camera-error {
        color: var(--mat-sys-error, #b3261e);
      }
    `,
  ],
})
export class PhotoCaptureComponent implements OnDestroy {
  @Input({ required: true }) valoracionId!: string;
  readonly photoAdded = output<Photo>();

  private readonly valoracionService = inject(ValoracionService);

  protected readonly active = signal(false);
  protected readonly tag = signal<PhotoTag>('BEFORE');
  protected readonly reviewing = signal(false);
  protected readonly uploading = signal(false);
  protected readonly cameraError = signal(false);
  protected reviewImageUrl: string | null = null;

  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private reviewBlob: Blob | null = null;
  private requestingCamera = false;

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
    if (this.active() || this.stream || this.requestingCamera) return;
    this.requestingCamera = true;
    this.cameraError.set(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraError.set(true);
      this.requestingCamera = false;
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
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

  protected setTag(tag: PhotoTag): void {
    this.tag.set(tag);
  }

  protected capture(): void {
    const video = this.videoElement;
    if (!video) return;
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
  }

  protected async usePhoto(): Promise<void> {
    if (!this.reviewBlob) return;
    this.uploading.set(true);
    try {
      const photo = await this.valoracionService.uploadPhoto(
        this.valoracionId,
        this.reviewBlob,
        this.tag()
      );
      this.photoAdded.emit(photo);
      this.discardReview();
      this.reviewing.set(false);
    } finally {
      this.uploading.set(false);
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
    this.stopStream();
    this.discardReview();
  }
}
