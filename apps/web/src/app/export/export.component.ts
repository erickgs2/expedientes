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
        max-width: 480px;
      }
      .module-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .actions {
        margin-top: 20px;
      }
      .error-message {
        color: var(--mat-sys-error, #b3261e);
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
      await this.deliverPdf(blob, patient.fullName);
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

  /**
   * A pointing device that can hover and click precisely means a desktop browser — one with a
   * built-in PDF viewer and room for a second tab. Phones and tablets (including a tablet with a
   * keyboard case) report a coarse pointer and no hover, and a touchscreen laptop still reports
   * fine/hover because of its trackpad, which is the answer we want in both cases.
   */
  private isDesktopBrowser(): boolean {
    return (
      window.matchMedia?.('(pointer: fine)').matches === true &&
      window.matchMedia?.('(hover: hover)').matches === true
    );
  }

  /**
   * Hands the finished PDF to the user.
   *
   * On a phone or tablet: iOS/WKWebView — where this app runs inside the native shell — ignores an
   * anchor's `download` attribute, so the click that works on desktop silently does nothing there.
   * The PDF goes to the native share sheet instead ("Guardar en Archivos", mail, AirDrop), falling
   * back to the anchor download if sharing isn't available or fails.
   *
   * On desktop: the file downloads and also opens in a new tab, so the record can be read straight
   * away instead of being hunted down in the downloads folder.
   */
  private async deliverPdf(blob: Blob, patientName: string): Promise<void> {
    const dateStr = new Date().toISOString().substring(0, 10);
    const fileName = `${patientName.replace(/[^a-zA-Z0-9]+/g, '-') || 'patient'}-${dateStr}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const isDesktop = this.isDesktopBrowser();

    // Desktop deliberately skips the share sheet. macOS Safari implements the Web Share API with
    // files, so without this check a Mac gets an AirDrop/Mail panel — useful on a phone, a detour
    // on a desktop where the point is to read the record straight away.
    if (!isDesktop && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return;
      } catch (error) {
        // Dismissing the share sheet is a normal outcome, not a failure to report.
        if ((error as DOMException | null)?.name === 'AbortError') return;
        console.warn('Sharing the export failed; falling back to a download', error);
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // The download above always happens; the preview tab is a bonus on top of it. Generating the
    // PDF takes long enough that the browser's user-activation window may have lapsed, so a popup
    // blocker can refuse this — the user still has the downloaded file either way.
    const previewTab = isDesktop ? window.open(url, '_blank') : null;
    if (isDesktop && !previewTab) {
      console.info('The export preview tab was blocked; the PDF was downloaded instead.');
    }

    // Revoking synchronously can cancel the transfer before the browser has finished reading the
    // blob. Once a preview tab holds the URL, keep it alive for this page's lifetime instead —
    // revoking would break the tab on reload for the sake of memory the user is still using.
    if (!previewTab) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
}
