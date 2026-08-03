import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { HasPermissionDirective } from '../auth/has-permission.directive';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { ValoracionService } from '../valoracion/valoracion.service';
import { TreatmentsService } from '../treatments/treatments.service';
import { TreatmentDiagramService } from '../treatments/treatment-diagram.service';
import { renderDiagramToBlob } from './diagram-render.util';
import { ExportService, type ExportDiagramImage } from './export.service';

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [
    FormsModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <h1>{{ 'export.title' | transloco }} — {{ patient()?.fullName }}</h1>

    <mat-checkbox [(ngModel)]="includeHistoriaClinica">
      {{ 'export.modules.historiaClinica' | transloco }}
    </mat-checkbox>
    <br />
    <mat-checkbox [(ngModel)]="includeValoracion">
      {{ 'export.modules.valoracion' | transloco }}
    </mat-checkbox>
    <br />
    <mat-checkbox [(ngModel)]="includeTreatments">
      {{ 'export.modules.treatments' | transloco }}
    </mat-checkbox>

    @if (errorMessage()) {
      <p class="error-message">{{ errorMessage() }}</p>
    }

    <div class="actions">
      <button
        *appHasPermission="'export:create'"
        mat-flat-button
        color="primary"
        [disabled]="generating()"
        (click)="generate()"
      >
        {{ (generating() ? 'export.generating' : 'export.generate') | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      .actions {
        margin-top: 16px;
      }
      .error-message {
        color: var(--mat-sys-error, #b3261e);
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

  protected readonly patient = this.activePatient.patient;

  protected includeHistoriaClinica = true;
  protected includeValoracion = true;
  protected includeTreatments = true;

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
        },
        language,
        diagramImages
      );
      this.downloadBlob(blob, patient.fullName);
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
          const blob = await renderDiagramToBlob(diagram.view, diagram.data);
          if (!blob) {
            throw new Error(
              `Failed to render diagram for Valoración ${valoracion.id} (${diagram.view})`
            );
          }
          images.push({ key: `diagram_valoracion_${valoracion.id}_${diagram.view}`, blob });
        }
      }
    }

    if (this.includeTreatments) {
      const summaries = await this.treatmentsService.list(patientId);
      const fullOnes = await Promise.all(summaries.map((t) => this.treatmentsService.get(t.id)));
      for (const treatment of fullOnes) {
        for (const item of treatment.items) {
          const detail = await this.treatmentDiagramService.getItem(item.id);
          for (const diagram of detail.diagrams) {
            const blob = await renderDiagramToBlob(diagram.view, diagram.data);
            if (!blob) {
              throw new Error(
                `Failed to render diagram for Treatment item ${item.id} (${diagram.view})`
              );
            }
            images.push({ key: `diagram_treatmentItem_${item.id}_${diagram.view}`, blob });
          }
        }
      }
    }

    return images;
  }

  private downloadBlob(blob: Blob, patientName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateStr = new Date().toISOString().substring(0, 10);
    anchor.href = url;
    anchor.download = `${patientName.replace(/[^a-zA-Z0-9]+/g, '-') || 'patient'}-${dateStr}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
