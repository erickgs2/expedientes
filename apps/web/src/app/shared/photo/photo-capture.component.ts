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
      <!-- Only while the camera panel is up, matching the pre-extraction behaviour: an idle
           "add photos" screen should not carry a stray tag selector. Shown in both the live and
           review steps, since the native-camera fallback skips the live step entirely and this is
           the only place its user can pick a tag. -->
      @if (camera.active()) {
        <mat-button-toggle-group
          class="tag-group"
          [value]="tag()"
          [hideSingleSelectionIndicator]="true"
        >
          <mat-button-toggle value="BEFORE" (click)="setTag('BEFORE')">
            {{ 'valoracion.photos.before' | transloco }}
          </mat-button-toggle>
          <mat-button-toggle value="AFTER" (click)="setTag('AFTER')">
            {{ 'valoracion.photos.after' | transloco }}
          </mat-button-toggle>
        </mat-button-toggle-group>
      }
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
