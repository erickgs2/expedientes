export type PhotoTag = 'BEFORE' | 'AFTER';

export interface Photo {
  id: string;
  patientId: string;
  valoracionId: string;
  tag: PhotoTag;
  filePath: string;
  createdAt: string;
}
