import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Valoracion,
  ValoracionSummary,
  ValoracionUpdateInput,
  ValoracionDiagramsUpdateInput,
  Photo,
  PhotoTag,
} from '@expedientes/shared-types';

/**
 * Today's date as a local `YYYY-MM-DD` string. Deliberately not `toISOString()`, which converts to
 * UTC and can report tomorrow's date for an evening visit in a negative-UTC-offset timezone.
 */
function todayLocalDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class ValoracionService {
  private readonly http = inject(HttpClient);

  // `ValoracionSummary`, not `Valoracion`: the list endpoint doesn't include the `diagrams`
  // relation, so typing these rows as full `Valoracion`s would promise a field that is `undefined`
  // at runtime. Fetch a single Valoración with `get()` when its diagrams are needed.
  list(patientId: string): Promise<ValoracionSummary[]> {
    return firstValueFrom(
      this.http.get<{ valoraciones: ValoracionSummary[] }>(`/api/patients/${patientId}/valoracion`)
    ).then((r) => r.valoraciones);
  }

  create(patientId: string): Promise<Valoracion> {
    return firstValueFrom(
      this.http.post<{ valoracion: Valoracion }>(`/api/patients/${patientId}/valoracion`, {
        fecha: todayLocalDateString(),
      })
    ).then((r) => r.valoracion);
  }

  get(id: string): Promise<Valoracion> {
    return firstValueFrom(
      this.http.get<{ valoracion: Valoracion }>(`/api/valoracion/${id}`)
    ).then((r) => r.valoracion);
  }

  update(id: string, input: ValoracionUpdateInput): Promise<Valoracion> {
    return firstValueFrom(
      this.http.patch<{ valoracion: Valoracion }>(`/api/valoracion/${id}`, input)
    ).then((r) => r.valoracion);
  }

  updateDiagrams(id: string, input: ValoracionDiagramsUpdateInput): Promise<Valoracion> {
    return firstValueFrom(
      this.http.patch<{ valoracion: Valoracion }>(`/api/valoracion/${id}/diagram`, input)
    ).then((r) => r.valoracion);
  }

  listPhotos(valoracionId: string): Promise<Photo[]> {
    return firstValueFrom(
      this.http.get<{ photos: Photo[] }>(`/api/valoracion/${valoracionId}/photos`)
    ).then((r) => r.photos);
  }

  listPatientPhotos(patientId: string): Promise<Photo[]> {
    return firstValueFrom(
      this.http.get<{ photos: Photo[] }>(`/api/patients/${patientId}/photos`)
    ).then((r) => r.photos);
  }

  uploadPhoto(valoracionId: string, blob: Blob, tag: PhotoTag): Promise<Photo> {
    const formData = new FormData();
    formData.append('photo', blob, 'photo.jpg');
    formData.append('tag', tag);
    return firstValueFrom(
      this.http.post<{ photo: Photo }>(`/api/valoracion/${valoracionId}/photos`, formData)
    ).then((r) => r.photo);
  }

  deletePhoto(valoracionId: string, photoId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/valoracion/${valoracionId}/photos/${photoId}`)
    ).then(() => undefined);
  }
}
