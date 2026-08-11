import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { PermissionModule, PhotoRecord, PhotoTag } from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { PhotoCaptureComponent } from './photo-capture.component';
import type { PhotoDataSource } from './photo-data-source';

@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule, PhotoCaptureComponent],
  template: `
    <div class="photo-gallery">
      @if (canEdit) {
        <app-photo-capture [dataSource]="dataSource" (photoAdded)="onPhotoAdded($event)" />
      }
      @if (photos().length) {
        <div class="photo-grid">
          @for (photo of photos(); track photo.id) {
            <div class="photo-item">
              <img [src]="photoUrl(photo)" alt="" />
              <span class="photo-tag">{{ tagLabelKey(photo.tag) | transloco }}</span>
              @if (canEdit) {
                <!-- Plain button, not mat-icon-button: this needs to sit on the photo at a fixed
                     size, and Material's own 48px box and ripple fight absolute positioning. -->
                <button
                  class="photo-delete"
                  type="button"
                  (click)="delete(photo)"
                  [attr.aria-label]="'valoracion.photos.delete' | transloco"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </div>
          }
        </div>
      } @else {
        <div class="empty-state">
          <mat-icon>photo_library</mat-icon>
          <p>{{ 'valoracion.photos.empty' | transloco }}</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .photo-item {
        position: relative;
        /* Bounds the absolutely positioned tag and delete button to this cell. */
        isolation: isolate;
      }
      .photo-item img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 8px;
        display: block;
        background: var(--mat-sys-surface-container-high, #eee);
      }
      .photo-tag {
        position: absolute;
        bottom: 8px;
        left: 8px;
        /* Never let a long label run under the delete button or past the photo. */
        max-width: calc(100% - 60px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: rgba(0, 0, 0, 0.68);
        color: #fff;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.4;
        padding: 3px 10px;
        border-radius: 999px;
      }
      .photo-delete {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 44px;
        height: 44px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        cursor: pointer;
        appearance: none;
        transition: background-color 150ms ease-out;
      }
      .photo-delete:hover {
        background: var(--mat-sys-error, #b3261e);
      }
      .photo-delete mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    `,
  ],
})
export class PhotoGalleryComponent implements OnInit {
  @Input({ required: true }) dataSource!: PhotoDataSource;
  @Input({ required: true }) permissionModule!: PermissionModule;

  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly photos = signal<PhotoRecord[]>([]);
  protected canEdit = false;

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission(this.permissionModule, 'edit');
    this.photos.set(await this.dataSource.list());
  }

  protected photoUrl(photo: PhotoRecord): string {
    return `/api/files/${photo.filePath}`;
  }

  protected tagLabelKey(tag: PhotoTag): string {
    return tag === 'BEFORE' ? 'valoracion.photos.before' : 'valoracion.photos.after';
  }

  protected onPhotoAdded(photo: PhotoRecord): void {
    this.photos.update((current) => [...current, photo]);
  }

  protected async delete(photo: PhotoRecord): Promise<void> {
    // Resolved fresh on each use so a live language switch is reflected, matching the facial
    // diagram tool's `clearAll` confirm pattern.
    if (!confirm(this.transloco.translate('valoracion.photos.confirmDelete'))) return;
    await this.dataSource.delete(photo.id);
    this.photos.update((current) => current.filter((p) => p.id !== photo.id));
  }
}
