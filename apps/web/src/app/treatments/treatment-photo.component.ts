import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { TreatmentItemDetail } from '@expedientes/shared-types';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { PhotoGalleryComponent } from '../shared/photo/photo-gallery.component';
import type { PhotoDataSource } from '../shared/photo/photo-data-source';
import { TreatmentPhotoService } from './treatment-photo.service';

@Component({
  selector: 'app-treatment-photo',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule, PhotoGalleryComponent],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (loadFailed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      <h1>{{ 'treatments.photosTitle' | transloco }} — {{ item()?.treatmentTypeName }}</h1>
      <app-photo-gallery [dataSource]="dataSource" permissionModule="treatments" />
      <button mat-button (click)="back()">{{ 'common.back' | transloco }}</button>
    }
  `,
})
export class TreatmentPhotoComponent implements OnInit {
  private readonly treatmentPhotoService = inject(TreatmentPhotoService);
  private readonly activePatient = inject(ActivePatientStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly item = signal<TreatmentItemDetail | null>(null);
  protected dataSource!: PhotoDataSource;

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
    // `TreatmentDiagramComponent`/`ConsentSignComponent` — never briefly render the wrong
    // patient's photo data.
    let mismatched = false;
    try {
      const item = await this.treatmentPhotoService.getItem(this.itemId);
      if (item.patientId !== this.activePatient.patient()?.id) {
        mismatched = true;
        this.router.navigate(['/treatments']);
        return;
      }
      this.item.set(item);
      this.dataSource = {
        list: () => this.treatmentPhotoService.list(this.itemId),
        upload: (blob, tag) => this.treatmentPhotoService.upload(this.itemId, blob, tag),
        delete: (photoId) => this.treatmentPhotoService.delete(this.itemId, photoId),
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
