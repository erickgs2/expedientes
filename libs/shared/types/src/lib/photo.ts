export type PhotoTag = 'BEFORE' | 'AFTER';

export interface Photo {
  id: string;
  patientId: string;
  valoracionId: string;
  tag: PhotoTag;
  filePath: string;
  createdAt: string;
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
}
