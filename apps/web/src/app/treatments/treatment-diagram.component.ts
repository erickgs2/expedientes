import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentItemDetail } from '@expedientes/shared-types';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { FacialDiagramViewsComponent } from '../shared/facial-diagram/facial-diagram-views.component';
import type { DiagramDataSource } from '../shared/facial-diagram/diagram-data-source';
import { TreatmentDiagramService } from './treatment-diagram.service';

@Component({
  selector: 'app-treatment-diagram',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule, FacialDiagramViewsComponent],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.diagramTitle' | transloco }} — {{ item()?.treatmentTypeName }}</h1>
      <app-facial-diagram-views
        [dataSource]="dataSource"
        permissionModule="treatments"
        [diagrams]="item()!.diagrams"
      />
      <button mat-button (click)="back()">{{ 'common.back' | transloco }}</button>
    }
  `,
})
export class TreatmentDiagramComponent implements OnInit {
  private readonly treatmentDiagramService = inject(TreatmentDiagramService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected dataSource!: DiagramDataSource;

  private itemId = '';

  async ngOnInit(): Promise<void> {
    this.itemId = this.route.snapshot.paramMap.get('itemId') ?? '';
    if (!this.itemId) {
      this.loadFailed.set(true);
      this.loading.set(false);
      return;
    }
    // Set when we redirect away on a patient mismatch, so `finally` leaves the loading state up
    // for the real duration of the navigation, matching the same guard pattern used by
    // `TreatmentDetailComponent`/`ConsentSignComponent` — never briefly render the wrong patient's
    // diagram data.
    let mismatched = false;
    try {
      const item = await this.treatmentDiagramService.getItem(this.itemId);
      if (item.patientId !== this.activePatient.patient()?.id) {
        mismatched = true;
        this.router.navigate(['/treatments']);
        return;
      }
      this.item.set(item);
      this.dataSource = {
        listReferenceOptions: async () => {
          const items = await this.treatmentDiagramService.listSameTypeItems(
            item.patientId,
            item.treatmentTypeId
          );
          return items
            .filter((i) => i.id !== this.itemId)
            .map((i) => ({ id: i.id, label: i.fecha.substring(0, 10) }));
        },
        getReferenceViews: async (id: string) => {
          const refItem = await this.treatmentDiagramService.getItem(id);
          // The reference picker only ever offers ids from this patient's own same-type item list
          // (see `listReferenceOptions` above), so this cannot trigger today — it asserts that
          // invariant rather than trusting it, matching the same defense-in-depth pattern
          // Valoración's own data source uses.
          if (refItem.patientId !== item.patientId) return [];
          return refItem.diagrams;
        },
        save: (views) => this.treatmentDiagramService.saveDiagrams(this.itemId, views),
      };
    } catch (error) {
      console.error('Failed to load treatment item', error);
      this.loadFailed.set(true);
    } finally {
      if (!mismatched) {
        this.loading.set(false);
      }
    }
  }

  protected back(): void {
    const treatmentId = this.item()?.treatmentId;
    this.router.navigate(treatmentId ? ['/treatments', treatmentId] : ['/treatments']);
  }
}
