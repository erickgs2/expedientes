import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ValoracionService } from '../valoracion/valoracion.service';
import { TreatmentsService } from '../treatments/treatments.service';
import { TreatmentDiagramService } from '../treatments/treatment-diagram.service';
import { renderDiagramToBlob } from '../shared/facial-diagram/diagram-render.util';
import { composeFrontDiagram } from '../shared/facial-diagram/diagram-geometry';
import type { AddendumKind, DiagramView } from '@expedientes/shared-types';
import { NoteSignatureService } from '../shared/note-signature/note-signature.service';
import { deliverPdf } from '../shared/pdf/deliver-pdf.util';
import { ExportService, type ExportDiagramImage } from './export.service';

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [
    FormsModule,
    MatCheckboxModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <h1>{{ 'export.title' | transloco }} — {{ patient()?.fullName }}</h1>

    <mat-card class="export-card">
      <mat-card-content>
        <div class="module-list" role="group">
          <mat-checkbox [(ngModel)]="includeHistoriaClinica">
            {{ 'export.modules.historiaClinica' | transloco }}
          </mat-checkbox>
          <mat-checkbox [(ngModel)]="includeValoracion">
            {{ 'export.modules.valoracion' | transloco }}
          </mat-checkbox>
          <mat-checkbox [(ngModel)]="includeTreatments">
            {{ 'export.modules.treatments' | transloco }}
          </mat-checkbox>
          <mat-checkbox [(ngModel)]="includeConsents">
            {{ 'export.modules.consents' | transloco }}
          </mat-checkbox>
        </div>

        <!-- Off by default: retired photos are kept as part of the record, but are not part of the
             working view, so they only go out when someone asks for them. -->
        <div class="optional" role="group" [attr.aria-label]="'export.optional.title' | transloco">
          <p class="optional-title">{{ 'export.optional.title' | transloco }}</p>
          <mat-checkbox [(ngModel)]="includeRetiredPhotos">
            {{ 'export.modules.retiredPhotos' | transloco }}
          </mat-checkbox>
          <p class="optional-hint">{{ 'export.optional.retiredPhotosHint' | transloco }}</p>
        </div>

        @if (errorMessage()) {
          <p class="error-message" role="alert">{{ errorMessage() }}</p>
        }

        <div class="actions">
          <button
            *appHasPermission="'export:create'"
            mat-flat-button
            color="primary"
            [disabled]="generating()"
            (click)="generate()"
          >
            <mat-icon>download</mat-icon>
            {{ (generating() ? 'export.generating' : 'export.generate') | transloco }}
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .export-card {
        max-width: 560px;
      }
      .module-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .optional {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--plate-line);
      }
      .optional-title {
        margin: 0 0 4px;
        font-weight: 600;
        font-size: 14px;
      }
      .optional-hint {
        margin: 0 0 0 40px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .actions {
        margin-top: 20px;
      }
      .error-message {
        color: var(--mat-sys-error);
        margin: 16px 0 0;
      }
    `,
  ],
})
export class ExportComponent {
  private readonly activePatient = inject(ActivePatientStore);
  private readonly transloco = inject(TranslocoService);
  private readonly valoracionService = inject(ValoracionService);
  private readonly treatmentsService = inject(TreatmentsService);
  private readonly treatmentDiagramService = inject(TreatmentDiagramService);
  private readonly exportService = inject(ExportService);
  private readonly noteSignatures = inject(NoteSignatureService);

  protected readonly patient = this.activePatient.patient;

  protected includeHistoriaClinica = true;
  protected includeValoracion = true;
  protected includeTreatments = true;
  protected includeConsents = true;
  protected includeRetiredPhotos = false;

  protected readonly generating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async generate(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;

    this.generating.set(true);
    this.errorMessage.set(null);
    try {
      const diagramImages = await this.collectDiagramImages(patient.id);
      const language = this.transloco.getActiveLang() === 'en' ? 'en' : 'es';
      const blob = await this.exportService.generateExport(
        patient.id,
        {
          historiaClinica: this.includeHistoriaClinica,
          valoracion: this.includeValoracion,
          treatments: this.includeTreatments,
          consents: this.includeConsents,
          retiredPhotos: this.includeRetiredPhotos,
        },
        language,
        diagramImages
      );
      const dateStr = new Date().toISOString().substring(0, 10);
      await deliverPdf(
        blob,
        `${patient.fullName.replace(/[^a-zA-Z0-9]+/g, '-') || 'patient'}-${dateStr}.pdf`
      );
    } catch (error) {
      console.error('Failed to generate export', error);
      this.errorMessage.set(this.transloco.translate('export.generateFailed'));
    } finally {
      this.generating.set(false);
    }
  }

  /**
   * Renders every diagram belonging to a checked module into a PNG before the export request is
   * sent. Throws (aborting the whole export — `generate()`'s catch block handles it) if any single
   * diagram fails to render, per this app's "never submit a partially-illustrated export" rule.
   */
  private async collectDiagramImages(patientId: string): Promise<ExportDiagramImage[]> {
    const images: ExportDiagramImage[] = [];

    if (this.includeValoracion) {
      const summaries = await this.valoracionService.list(patientId);
      const fullOnes = await Promise.all(summaries.map((v) => this.valoracionService.get(v.id)));
      for (const valoracion of fullOnes) {
        for (const diagram of valoracion.diagrams) {
          const blob = await renderDiagramToBlob(diagram.view, frontAsSummary(diagram, valoracion.diagrams));
          if (!blob) {
            throw new Error(
              `Failed to render diagram for Valoración ${valoracion.id} (${diagram.view})`
            );
          }
          images.push({ key: `diagram_valoracion_${valoracion.id}_${diagram.view}`, blob });
        }
        await this.collectAddendumImages('valoracion', valoracion.id, images);
      }
    }

    if (this.includeTreatments) {
      const summaries = await this.treatmentsService.list(patientId);
      const fullOnes = await Promise.all(summaries.map((t) => this.treatmentsService.get(t.id)));
      for (const treatment of fullOnes) {
        for (const item of treatment.items) {
          const detail = await this.treatmentDiagramService.getItem(item.id);
          for (const diagram of detail.diagrams) {
            const blob = await renderDiagramToBlob(diagram.view, frontAsSummary(diagram, detail.diagrams));
            if (!blob) {
              throw new Error(
                `Failed to render diagram for Treatment item ${item.id} (${diagram.view})`
              );
            }
            images.push({ key: `diagram_treatmentItem_${item.id}_${diagram.view}`, blob });
          }
        }
        await this.collectAddendumImages('treatment', treatment.id, images);
      }
    }

    return images;
  }

  /** The drawings of a note's signed addenda, printed under the note with each addendum. */
  private async collectAddendumImages(
    kind: AddendumKind,
    noteId: string,
    images: ExportDiagramImage[]
  ): Promise<void> {
    for (const addendum of await this.noteSignatures.addenda(kind, noteId)) {
      for (const diagram of addendum.diagrams) {
        const blob = await renderDiagramToBlob(diagram.view, frontAsSummary(diagram, addendum.diagrams));
        if (!blob) throw new Error(`Failed to render diagram for addendum ${addendum.id} (${diagram.view})`);
        images.push({ key: `diagram_addendum_${addendum.id}_${diagram.view}`, blob });
      }
    }
  }
}

/** The full face is printed as the summary of the close-ups, the same way it is shown on screen. */
function frontAsSummary(
  diagram: { view: DiagramView; data: Record<string, unknown> },
  all: { view: DiagramView; data: Record<string, unknown> }[]
): Record<string, unknown> {
  if (diagram.view !== 'FRONT') return diagram.data;
  return composeFrontDiagram(Object.fromEntries(all.map((d) => [d.view, d.data]))) ?? diagram.data;
}
