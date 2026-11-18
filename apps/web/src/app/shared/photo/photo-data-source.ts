import type { PhotoRecord, PhotoTag } from '@expedientes/shared-types';

/**
 * Strategy object `PhotoCaptureComponent`/`PhotoGalleryComponent` use for everything that used to
 * be a direct `ValoracionService` call — lets the same capture/gallery UI serve both a Valoración
 * visit and a Treatment item without either concept living inside the components themselves.
 * Mirrors `DiagramDataSource`'s shape/spirit exactly.
 */
export interface PhotoDataSource {
  list(): Promise<PhotoRecord[]>;
  upload(blob: Blob, tag: PhotoTag): Promise<PhotoRecord>;
  /** Retires the photo from the gallery (NOM-004-SSA3-2012: nothing clinical is deleted). */
  delete(photoId: string): Promise<void>;
  /** Photos retired from this gallery, with who retired them. */
  listRetired(): Promise<PhotoRecord[]>;
  /** Puts a retired photo back in the gallery. */
  restore(photoId: string): Promise<void>;
}
