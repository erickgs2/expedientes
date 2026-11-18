import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { PermissionModule, PhotoRecord, PhotoTag } from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { PhotoCaptureComponent } from './photo-capture.component';
import { PhotoViewerDialogComponent } from './photo-viewer-dialog.component';
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
              <!-- The tile loads the small thumbnail; tapping it shows the full-resolution original. -->
              <button
                type="button"
                class="photo-open"
                (click)="openViewer(photo)"
                [attr.aria-label]="'common.viewPhoto' | transloco"
              >
                <img [src]="thumbnailUrl(photo)" alt="" loading="lazy" />
              </button>
              <span class="photo-tag">{{ tagLabelKey(photo.tag) | transloco }}</span>
              @if (canEdit) {
                <!-- Plain button, not mat-icon-button: this needs to sit on the photo at a fixed
                     size, and Material's own 48px box and ripple fight absolute positioning. -->
                <button
                  class="photo-delete"
                  type="button"
                  (click)="delete(photo)"
                  [attr.aria-label]="'valoracion.photos.retire' | transloco"
                  [attr.title]="'valoracion.photos.retire' | transloco"
                >
                  <mat-icon>archive</mat-icon>
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

      <!-- Retired photos stay part of the record (NOM-004-SSA3-2012 5.4): folded away, never gone. -->
      @if (retired().length) {
        <section class="retired">
          <button
            type="button"
            class="retired-toggle"
            [attr.aria-expanded]="showRetired()"
            (click)="showRetired.set(!showRetired())"
          >
            <mat-icon aria-hidden="true">{{ showRetired() ? 'expand_less' : 'expand_more' }}</mat-icon>
            {{ 'valoracion.photos.retiredCount' | transloco: { n: retired().length } }}
          </button>
          @if (showRetired()) {
            <p class="retired-note">{{ 'valoracion.photos.retiredNote' | transloco }}</p>
            <ul class="retired-list">
              @for (photo of retired(); track photo.id) {
                <li class="retired-item">
                  <button
                    type="button"
                    class="retired-open"
                    (click)="openViewer(photo)"
                    [attr.aria-label]="'common.viewPhoto' | transloco"
                  >
                    <img [src]="thumbnailUrl(photo)" alt="" loading="lazy" />
                  </button>
                  <div class="retired-text">
                    <span class="retired-tag">{{ tagLabelKey(photo.tag) | transloco }}</span>
                    <span class="retired-meta">
                      {{ 'valoracion.photos.retiredOn' | transloco: { date: shortDate(photo.archivedAt), name: photo.archivedByName || '—' } }}
                    </span>
                  </div>
                  @if (canEdit) {
                    <button mat-stroked-button type="button" class="retired-restore" (click)="restore(photo)">
                      {{ 'valoracion.photos.putBack' | transloco }}
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
        /* Ruled off from the capture controls above: without it the first thumbnail reads as part
           of the button row. */
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid var(--plate-line);
      }
      /* A bare button around each tile: keeps the tile's block layout, and the focus ring is the
         global one. */
      .photo-open {
        display: block;
        width: 100%;
        padding: 0;
        border: 0;
        background: none;
        border-radius: var(--plate-radius);
        cursor: zoom-in;
      }
      .photo-item img {
        transition: transform 150ms ease-out;
      }
      .photo-item:hover img {
        transform: scale(1.02);
      }
      @media (prefers-reduced-motion: reduce) {
        .photo-item img {
          transition: none;
        }
        .photo-item:hover img {
          transform: none;
        }
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
        border-radius: var(--plate-radius);
        display: block;
        background: var(--mat-sys-surface-container);
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
      /* Retiring is not destructive (the photo is kept), so it takes no alarm colour. */
      .photo-delete:hover {
        background: rgba(0, 0, 0, 0.8);
      }
      .photo-delete mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .retired {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid var(--plate-line);
      }
      .retired-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: 0 12px 0 6px;
        border: 0;
        border-radius: 22px;
        background: none;
        color: var(--mat-sys-on-surface-variant);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
      }
      .retired-toggle:hover {
        background: var(--mat-sys-surface-container-low);
        color: var(--mat-sys-on-surface);
      }
      .retired-note {
        margin: 4px 0 12px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .retired-list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
      .retired-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px 8px 8px;
      }
      .retired-item + .retired-item {
        border-top: 1px solid var(--plate-line);
      }
      .retired-open {
        flex: none;
        padding: 0;
        border: 0;
        background: none;
        border-radius: 8px;
        cursor: zoom-in;
      }
      .retired-open img {
        display: block;
        width: 56px;
        height: 56px;
        object-fit: cover;
        border-radius: 8px;
        background: var(--mat-sys-surface-container);
      }
      .retired-text {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .retired-tag {
        font-weight: 600;
        font-size: 14px;
      }
      .retired-meta {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class PhotoGalleryComponent implements OnInit {
  @Input({ required: true }) dataSource!: PhotoDataSource;
  @Input({ required: true }) permissionModule!: PermissionModule;

  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly photos = signal<PhotoRecord[]>([]);
  protected readonly retired = signal<PhotoRecord[]>([]);
  protected readonly showRetired = signal(false);
  protected canEdit = false;

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission(this.permissionModule, 'edit');
    const [photos, retired] = await Promise.all([
      this.dataSource.list(),
      this.dataSource.listRetired().catch(() => [] as PhotoRecord[]),
    ]);
    this.photos.set(photos);
    this.retired.set(retired);
  }

  protected shortDate(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  protected photoUrl(photo: PhotoRecord): string {
    return `/api/files/${photo.filePath}`;
  }

  protected thumbnailUrl(photo: PhotoRecord): string {
    return `${this.photoUrl(photo)}?thumb=1`;
  }

  protected openViewer(photo: PhotoRecord): void {
    this.dialog.open(PhotoViewerDialogComponent, {
      data: { url: this.photoUrl(photo) },
      maxWidth: '96vw',
      maxHeight: '92vh',
    });
  }

  protected tagLabelKey(tag: PhotoTag): string {
    return tag === 'BEFORE' ? 'valoracion.photos.before' : 'valoracion.photos.after';
  }

  protected onPhotoAdded(photo: PhotoRecord): void {
    this.photos.update((current) => [...current, photo]);
  }

  /** Retires the photo from the gallery: it moves to the folded "retired" list and can be put back. */
  protected async delete(photo: PhotoRecord): Promise<void> {
    // Resolved fresh on each use so a live language switch is reflected, matching the facial
    // diagram tool's `clearAll` confirm pattern.
    if (!confirm(this.transloco.translate('valoracion.photos.confirmRetire'))) return;
    await this.dataSource.delete(photo.id);
    this.photos.update((current) => current.filter((p) => p.id !== photo.id));
    this.retired.set(await this.dataSource.listRetired().catch(() => this.retired()));
  }

  protected async restore(photo: PhotoRecord): Promise<void> {
    await this.dataSource.restore(photo.id);
    this.retired.update((current) => current.filter((p) => p.id !== photo.id));
    this.photos.set(await this.dataSource.list());
  }
}
