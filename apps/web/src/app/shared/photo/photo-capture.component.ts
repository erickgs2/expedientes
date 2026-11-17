import { Component, Input, output, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import type { PhotoRecord, PhotoTag } from '@expedientes/shared-types';
import type { PhotoDataSource } from './photo-data-source';
import { CameraCaptureComponent } from './camera-capture.component';

@Component({
  selector: 'app-photo-capture',
  standalone: true,
  imports: [MatButtonToggleModule, TranslocoModule, CameraCaptureComponent],
  template: `
    <div class="photo-capture">
      <!-- Always visible, not just while the camera panel is open: it tags photos picked from the
           library too, and those never open that panel. Hiding it there meant an upload silently
           took whatever tag happened to be selected last. The label says which photos it applies
           to, since it is now shown before anything has been captured. -->
      <p class="tag-label" id="photo-tag-label">{{ 'valoracion.photos.tagLabel' | transloco }}</p>
      <mat-button-toggle-group
        class="tag-group"
        [value]="tag()"
        [hideSingleSelectionIndicator]="true"
        [disabled]="uploading()"
        aria-labelledby="photo-tag-label"
      >
        <mat-button-toggle value="BEFORE" (click)="setTag('BEFORE')">
          {{ 'valoracion.photos.before' | transloco }}
        </mat-button-toggle>
        <mat-button-toggle value="AFTER" (click)="setTag('AFTER')">
          {{ 'valoracion.photos.after' | transloco }}
        </mat-button-toggle>
      </mat-button-toggle-group>
      <app-camera-capture #camera [busy]="uploading()" (captured)="onCaptured($event)" />
    </div>
  `,
  styles: [
    `
      .photo-capture {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
      .tag-label {
        margin: 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .tag-group {
        width: 100%;
        max-width: 320px;
      }
      .tag-group mat-button-toggle {
        flex: 1;
      }
    `,
  ],
})
export class PhotoCaptureComponent {
  @Input({ required: true }) dataSource!: PhotoDataSource;
  readonly photoAdded = output<PhotoRecord>();

  protected readonly tag = signal<PhotoTag>('BEFORE');
  protected readonly uploading = signal(false);

  protected setTag(tag: PhotoTag): void {
    this.tag.set(tag);
  }

  /**
   * Uploads arrive one blob at a time, but a library selection emits a whole batch back-to-back.
   * They are queued rather than uploaded concurrently: parallel uploads would race the `uploading`
   * flag — the first to finish would clear it while the rest were still in flight — and would hit
   * the API with as many simultaneous multipart requests as the user picked files.
   */
  protected onCaptured(blob: Blob): void {
    this.queue.push(blob);
    void this.drainQueue();
  }

  private readonly queue: Blob[] = [];
  private draining = false;

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.uploading.set(true);
    try {
      while (this.queue.length > 0) {
        const blob = this.queue.shift() as Blob;
        // One failure must not strand the rest of the batch; the error interceptor reports it.
        try {
          const photo = await this.dataSource.upload(blob, this.tag());
          this.photoAdded.emit(photo);
        } catch (error) {
          console.error('Failed to upload a selected photo', error);
        }
      }
    } finally {
      this.draining = false;
      this.uploading.set(false);
    }
  }
}
