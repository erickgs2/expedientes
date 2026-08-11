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
      <!-- Shown alongside the camera in both its idle and active states, so the tag is picked
           once and applies whichever way the next photo is captured (live view or the
           native-camera fallback). -->
      <mat-button-toggle-group class="tag-group" [value]="tag()" [hideSingleSelectionIndicator]="true">
        <mat-button-toggle value="BEFORE" (click)="setTag('BEFORE')">
          {{ 'valoracion.photos.before' | transloco }}
        </mat-button-toggle>
        <mat-button-toggle value="AFTER" (click)="setTag('AFTER')">
          {{ 'valoracion.photos.after' | transloco }}
        </mat-button-toggle>
      </mat-button-toggle-group>
      <app-camera-capture [busy]="uploading()" (captured)="onCaptured($event)" />
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

  protected async onCaptured(blob: Blob): Promise<void> {
    this.uploading.set(true);
    try {
      const photo = await this.dataSource.upload(blob, this.tag());
      this.photoAdded.emit(photo);
    } finally {
      this.uploading.set(false);
    }
  }
}
