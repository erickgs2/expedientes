import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  PhotoRecord,
  PhotoTag,
  TreatmentItemDetail,
  TreatmentTimelinePhoto,
} from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class TreatmentPhotoService {
  private readonly http = inject(HttpClient);

  getItem(itemId: string): Promise<TreatmentItemDetail> {
    return firstValueFrom(
      this.http.get<{ item: TreatmentItemDetail }>(`/api/treatment-items/${itemId}`)
    ).then((r) => r.item);
  }

  list(itemId: string): Promise<PhotoRecord[]> {
    return firstValueFrom(
      this.http.get<{ photos: PhotoRecord[] }>(`/api/treatment-items/${itemId}/photos`)
    ).then((r) => r.photos);
  }

  upload(itemId: string, blob: Blob, tag: PhotoTag): Promise<PhotoRecord> {
    const formData = new FormData();
    formData.append('photo', blob, 'photo.jpg');
    formData.append('tag', tag);
    return firstValueFrom(
      this.http.post<{ photo: PhotoRecord }>(`/api/treatment-items/${itemId}/photos`, formData)
    ).then((r) => r.photo);
  }

  delete(itemId: string, photoId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/treatment-items/${itemId}/photos/${photoId}`)
    ).then(() => undefined);
  }

  listPatientPhotos(patientId: string): Promise<TreatmentTimelinePhoto[]> {
    return firstValueFrom(
      this.http.get<{ photos: TreatmentTimelinePhoto[] }>(
        `/api/patients/${patientId}/treatment-photos`
      )
    ).then((r) => r.photos);
  }
}
