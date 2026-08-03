import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import type { PhotoRecord, PhotoTag, TreatmentTimelinePhoto } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ValoracionService } from '../valoracion/valoracion.service';
import { TreatmentPhotoService } from '../treatments/treatment-photo.service';

interface PhotoTimelineGroup {
  id: string;
  label: string;
  fecha: string;
  photos: PhotoRecord[];
}

@Component({
  selector: 'app-photo-timeline',
  standalone: true,
  imports: [TranslocoModule],
  template: `
    <h1>{{ 'photoTimeline.title' | transloco }} — {{ patient()?.fullName }}</h1>
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p class="load-error">{{ 'common.loadError' | transloco }}</p>
    } @else {
      @for (group of groups(); track group.id) {
        <section class="timeline-group">
          <h2>{{ group.label }}</h2>
          <div class="photo-grid">
            @for (photo of group.photos; track photo.id) {
              <div class="photo-item">
                <img [src]="photoUrl(photo)" alt="" />
                <span class="photo-tag">{{ tagLabelKey(photo.tag) | transloco }}</span>
              </div>
            }
          </div>
        </section>
      } @empty {
        <p>{{ 'photoTimeline.empty' | transloco }}</p>
      }
    }
  `,
  styles: [
    `
      .load-error {
        color: var(--mat-sys-error, #b3261e);
      }
      .timeline-group {
        margin-bottom: 24px;
      }
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
export class PhotoTimelineComponent implements OnInit {
  private readonly valoracionService = inject(ValoracionService);
  private readonly treatmentPhotoService = inject(TreatmentPhotoService);
  private readonly auth = inject(AuthService);
  private readonly activePatient = inject(ActivePatientStore);

  protected readonly patient = this.activePatient.patient;
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly groups = signal<PhotoTimelineGroup[]>([]);

  async ngOnInit(): Promise<void> {
    const patient = this.patient();
    if (!patient) {
      this.loading.set(false);
      return;
    }
    try {
      // Only attempted for a user who actually has `treatments:view` — a user who permanently
      // lacks it should see the Valoración-only timeline exactly as it worked before this photo
      // reuse sub-project, not a permission error every time they open this page.
      const canViewTreatments = this.auth.hasPermission('treatments', 'view');
      const [visits, photos, treatmentPhotos] = await Promise.all([
        this.valoracionService.list(patient.id),
        this.valoracionService.listPatientPhotos(patient.id),
        canViewTreatments
          ? this.treatmentPhotoService.listPatientPhotos(patient.id)
          : Promise.resolve<TreatmentTimelinePhoto[]>([]),
      ]);

      const valoracionGroups: PhotoTimelineGroup[] = visits
        .map((visit) => ({
          id: visit.id,
          label: visit.fecha.substring(0, 10),
          fecha: visit.fecha,
          photos: photos.filter((photo) => photo.valoracionId === visit.id),
        }))
        .filter((group) => group.photos.length > 0);

      const byTreatmentItem = new Map<string, TreatmentTimelinePhoto[]>();
      for (const photo of treatmentPhotos) {
        const existing = byTreatmentItem.get(photo.treatmentItemId) ?? [];
        existing.push(photo);
        byTreatmentItem.set(photo.treatmentItemId, existing);
      }
      const treatmentGroups: PhotoTimelineGroup[] = Array.from(byTreatmentItem.values()).map(
        (groupPhotos) => ({
          id: groupPhotos[0].treatmentItemId,
          label: `${groupPhotos[0].fecha.substring(0, 10)} — ${groupPhotos[0].treatmentTypeName}`,
          fecha: groupPhotos[0].fecha,
          photos: groupPhotos,
        })
      );

      const groups = [...valoracionGroups, ...treatmentGroups].sort((a, b) =>
        a.fecha.localeCompare(b.fecha)
      );
      this.groups.set(groups);
    } catch (error) {
      // A thrown fetch must never fall through to render as if the patient simply has no photo
      // history — this page exists so clinicians can judge change over time, and a silent empty
      // state here would read as "no prior photos" when the real answer is "couldn't load".
      console.error('Failed to load photo timeline', error);
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected photoUrl(photo: PhotoRecord): string {
    return `/api/files/${photo.filePath}`;
  }

  protected tagLabelKey(tag: PhotoTag): string {
    return tag === 'BEFORE' ? 'valoracion.photos.before' : 'valoracion.photos.after';
  }
}
