import type { DiagramViewRecord } from '@expedientes/shared-types';

export interface DiagramReferenceOption {
  id: string;
  label: string;
}

/**
 * Strategy object `FacialDiagramViewsComponent` uses for everything that used to be a direct
 * `ValoracionService` call: listing/fetching reference options for the overlay picker, and saving
 * the current owner's views. Lets the same drawing tool serve both a Valoración visit and a
 * Treatment item without either concept living inside the component itself.
 *
 * This interface is deliberately frontend-only (not in `@expedientes/shared-types`): unlike
 * `DiagramViewRecord`, it doesn't correspond to any API wire shape — `label` is formatted by
 * whichever concrete data source implements this, not by the server.
 */
export interface DiagramDataSource {
  /** Past owners (visits or treatment items) eligible as a reference overlay, most recent first. */
  listReferenceOptions(): Promise<DiagramReferenceOption[]>;
  /** Fetch one reference option's diagram views. */
  getReferenceViews(id: string): Promise<DiagramViewRecord[]>;
  /** Persist the current owner's diagram views. A key mapped to `null` clears that view; an
   * omitted key leaves it unchanged. */
  save(views: Record<string, Record<string, unknown> | null>): Promise<DiagramViewRecord[]>;
}
