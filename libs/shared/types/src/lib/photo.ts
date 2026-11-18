export type PhotoTag = 'BEFORE' | 'AFTER';

export interface Photo {
  id: string;
  patientId: string;
  valoracionId: string;
  tag: PhotoTag;
  filePath: string;
  createdAt: string;
  /** Set when the photo was retired from the gallery (kept, never deleted). */
  archivedAt?: string | null;
  /** Who retired it; only on the "retired photos" list. */
  archivedByName?: string | null;
}

/** A photo's owner-agnostic shape — the fields `PhotoCaptureComponent`/`PhotoGalleryComponent`
 * actually read, independent of whether the owner is a Valoración visit or a Treatment item. Both
 * `Photo` and `TreatmentItemPhoto` are supersets of this, so either satisfies it structurally —
 * the same trick already used for `DiagramViewRecord`/`ValoracionDiagram`. */
export interface PhotoRecord {
  id: string;
  tag: PhotoTag;
  filePath: string;
  createdAt: string;
  /** Set on photos retired from the gallery; only on the "retired photos" list. */
  archivedAt?: string | null;
  archivedByName?: string | null;
}
