import { Component, ElementRef, ViewChild, inject, input, signal, AfterViewInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { SignatureSurface } from './signature-surface';
import {
  SignatureDialogComponent,
  type SignatureDialogData,
  type SignatureDialogResult,
} from './signature-dialog.component';

const SIGNATURE_JPEG_QUALITY = 0.9;

/**
 * Every signature in the app goes through this pad: a 600×200 box with a baseline and the signer's
 * name, "Ampliar" in its corner, and "Borrar". On a touch screen, touching the box opens it
 * enlarged in a dialog (SignatureDialogComponent), where signing is comfortable; with a mouse the
 * box can be signed in place too. The enlarged signature comes back here, so the exported JPEG is
 * always this pad's.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <div class="pad" [class.is-signed]="hasStrokes()" [class.is-disabled]="disabled()">
      <canvas
        #canvas
        class="signature-canvas"
        width="600"
        height="200"
        [attr.aria-label]="(title() || ('signaturePad.label' | transloco))"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="surface?.up()"
        (pointercancel)="surface?.up()"
      ></canvas>
      <span class="baseline" aria-hidden="true"></span>
      @if (caption()) {
        <span class="caption">{{ caption() }}</span>
      }
      <button
        type="button"
        class="expand"
        [disabled]="disabled()"
        [attr.aria-label]="'signaturePad.expandLabel' | transloco"
        (click)="openEnlarged()"
      >
        <mat-icon aria-hidden="true">open_in_full</mat-icon>
        <span>{{ 'signaturePad.expand' | transloco }}</span>
      </button>
    </div>
    <div class="pad-actions">
      <span class="hint">{{ 'signaturePad.touchHint' | transloco }}</span>
      <button mat-button type="button" [disabled]="disabled() || !hasStrokes()" (click)="clear()">
        {{ 'treatments.clearSignature' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 600px;
      }
      .pad {
        position: relative;
        border: 1px solid var(--plate-line-strong);
        border-radius: 8px;
        background: #fff;
        overflow: hidden;
      }
      .pad.is-disabled {
        opacity: 0.6;
      }
      .signature-canvas {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 1;
        touch-action: none;
        cursor: crosshair;
      }
      .baseline {
        position: absolute;
        left: 20px;
        right: 20px;
        bottom: 30px;
        border-bottom: 1px solid rgba(28, 28, 25, 0.32);
        pointer-events: none;
      }
      .caption {
        position: absolute;
        left: 20px;
        bottom: 8px;
        font-size: 12px;
        color: #42474e;
        pointer-events: none;
      }
      /* Always on the white paper of the pad, in either theme. */
      .expand {
        position: absolute;
        top: 8px;
        right: 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid rgba(28, 28, 25, 0.32);
        border-radius: 18px;
        background: #fff;
        color: #1c1c19;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .expand mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .expand:disabled {
        cursor: default;
        opacity: 0.5;
      }
      .pad-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 40px;
      }
      .hint {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class SignaturePadComponent implements AfterViewInit {
  readonly disabled = input(false);
  /** Shown under the baseline, e.g. the signer's name. */
  readonly caption = input<string | null>(null);
  /** Heading of the enlarged dialog, e.g. "Firma de la paciente". */
  readonly title = input<string | null>(null);
  /** Open the enlarged dialog when the box is touched on a touch screen. */
  readonly expandOnTouch = input(true);
  readonly hasStrokes = signal(false);

  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;
  protected surface: SignatureSurface | null = null;

  ngAfterViewInit(): void {
    this.surface = new SignatureSurface(this.canvasRef.nativeElement, 2);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled() || !this.surface) return;
    if (this.expandOnTouch() && event.pointerType === 'touch') {
      event.preventDefault();
      void this.openEnlarged();
      return;
    }
    this.surface.down(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.surface?.move(event)) this.hasStrokes.set(true);
  }

  async openEnlarged(): Promise<void> {
    if (this.disabled() || !this.surface) return;
    this.surface.up();
    const data: SignatureDialogData = {
      title: this.title() || this.transloco.translate('signaturePad.label'),
      caption: this.caption(),
      current: this.hasStrokes() ? this.canvasRef.nativeElement : null,
      currentHasStrokes: this.hasStrokes(),
    };
    const result = await firstValueFrom(
      this.dialog
        .open<SignatureDialogComponent, SignatureDialogData, SignatureDialogResult>(SignatureDialogComponent, {
          data,
          width: '96vw',
          maxWidth: '1280px',
          height: '88dvh',
          maxHeight: '860px',
          autoFocus: false,
          panelClass: 'signature-dialog-panel',
        })
        .afterClosed()
    );
    if (!result) return;
    this.surface.copyFrom(result.canvas, result.hasStrokes);
    this.hasStrokes.set(result.hasStrokes);
  }

  clear(): void {
    this.surface?.clear();
    this.hasStrokes.set(false);
  }

  toJpegBlob(): Promise<Blob | null> {
    return new Promise((resolve) =>
      this.canvasRef.nativeElement.toBlob(resolve, 'image/jpeg', SIGNATURE_JPEG_QUALITY)
    );
  }
}
