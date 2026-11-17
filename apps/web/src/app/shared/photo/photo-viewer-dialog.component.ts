import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';

export interface PhotoViewerData {
  /** URL of the full-resolution original (the gallery tiles show a thumbnail). */
  url: string;
}

/**
 * Shows one photo at full resolution inside the app. A dialog rather than a link to a new tab: in the
 * Capacitor shell a new tab either does nothing or opens the system browser, which has no session.
 */
@Component({
  selector: 'app-photo-viewer-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <div class="viewer">
      <img [src]="data.url" alt="" />
      <button
        mat-icon-button
        class="viewer-close"
        type="button"
        mat-dialog-close
        cdkFocusInitial
        [attr.aria-label]="'common.close' | transloco"
      >
        <mat-icon>close</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      .viewer {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--mat-sys-surface-container-low);
      }
      .viewer img {
        display: block;
        max-width: 100%;
        max-height: 86vh;
        object-fit: contain;
      }
      .viewer-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: var(--mat-sys-surface);
        border: 1px solid var(--plate-line);
      }
    `,
  ],
})
export class PhotoViewerDialogComponent {
  protected readonly data = inject<PhotoViewerData>(MAT_DIALOG_DATA);
}
