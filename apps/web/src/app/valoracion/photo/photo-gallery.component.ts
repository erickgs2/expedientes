import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { Photo, PhotoTag } from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { ValoracionService } from '../valoracion.service';
import { PhotoCaptureComponent } from './photo-capture.component';

@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule, PhotoCaptureComponent],
  template: `
    <div class="photo-gallery">
      @if (canEdit) {
        <app-photo-capture [valoracionId]="valoracionId" (photoAdded)="onPhotoAdded($event)" />
      }
      <div class="photo-grid">
        @for (photo of photos(); track photo.id) {
          <div class="photo-item">
            <img [src]="photoUrl(photo)" alt="" />
            <span class="photo-tag">{{ tagLabelKey(photo.tag) | transloco }}</span>
            @if (canEdit) {
              <button
                mat-icon-button
                type="button"
                (click)="delete(photo)"
                [attr.aria-label]="'valoracion.photos.delete' | transloco"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
        } @empty {
          <p>{{ 'valoracion.photos.empty' | transloco }}</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
        margin-top: 8px;
      }
      .photo-item {
        position: relative;
      }
      .photo-item img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 4px;
        display: block;
      }
      .photo-tag {
        position: absolute;
        bottom: 4px;
        left: 4px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
      }
    `,
  ],
})
export class PhotoGalleryComponent implements OnInit {
  @Input({ required: true }) valoracionId!: string;

  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly photos = signal<Photo[]>([]);
  protected canEdit = false;

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission('valoracion', 'edit');
    this.photos.set(await this.valoracionService.listPhotos(this.valoracionId));
  }

  protected photoUrl(photo: Photo): string {
    return `/api/files/${photo.filePath}`;
  }

  protected tagLabelKey(tag: PhotoTag): string {
    return tag === 'BEFORE' ? 'valoracion.photos.before' : 'valoracion.photos.after';
  }

  protected onPhotoAdded(photo: Photo): void {
    this.photos.update((current) => [...current, photo]);
  }

  protected async delete(photo: Photo): Promise<void> {
    // Resolved fresh on each use so a live language switch is reflected, matching the facial
    // diagram tool's `clearAll` confirm pattern.
    if (!confirm(this.transloco.translate('valoracion.photos.confirmDelete'))) return;
    await this.valoracionService.deletePhoto(this.valoracionId, photo.id);
    this.photos.update((current) => current.filter((p) => p.id !== photo.id));
  }
}
