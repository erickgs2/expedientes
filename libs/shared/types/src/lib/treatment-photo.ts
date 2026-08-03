import type { PhotoTag } from './photo.js';

export interface TreatmentItemPhoto {
  id: string;
  treatmentItemId: string;
  patientId: string;
  tag: PhotoTag;
  filePath: string;
  createdAt: string;
}

/** One patient-timeline photo sourced from a Treatment item, with enough denormalized context
 * (treatmentTypeName, fecha) for the timeline to group and label it without a second request —
 * the same "return display-ready fields" pattern `TreatmentSummary.treatmentTypeNames` uses. */
export interface TreatmentTimelinePhoto extends TreatmentItemPhoto {
  treatmentTypeName: string;
  fecha: string;
}
