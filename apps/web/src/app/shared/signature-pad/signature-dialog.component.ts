import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { SignatureSurface } from './signature-surface';

export interface SignatureDialogData {
  /** Heading, e.g. "Firma de la paciente". */
  title: string;
  /** Who signs and what, under the heading. */
  caption: string | null;
  /** The signature already drawn on the small pad, carried over so it can be finished or redone. */
  current: HTMLCanvasElement | null;
  currentHasStrokes: boolean;
}

/** Closes with the enlarged canvas when the signature is accepted, or nothing. */
export type SignatureDialogResult = { canvas: HTMLCanvasElement; hasStrokes: boolean } | null;

/**
 * Signing at full size: the same 3:1 canvas as the inline pad, as large as the screen allows, with
 * a baseline, a "×" guide and the signer's name. Accepting hands the drawing back to the pad that
 * opened it; nothing is saved until the form it belongs to is.
 */
@Component({
  selector: 'app-signature-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule],
  template: `
    <div class="head">
      <div class="titles">
        <h2 mat-dialog-title>{{ data.title }}</h2>
        @if (data.caption) {
          <p class="caption">{{ data.caption }}</p>
        }
      </div>
      <button mat-icon-button type="button" [mat-dialog-close]="null" [attr.aria-label]="'signaturePad.closeWithoutSaving' | transloco">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <div class="board">
      <canvas
        #canvas
        width="1500"
        height="500"
        [attr.aria-label]="'signaturePad.enlargedLabel' | transloco"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="surface?.up()"
        (pointercancel)="surface?.up()"
      ></canvas>
      <span class="guide" aria-hidden="true">×</span>
      <span class="baseline" aria-hidden="true"></span>
      <span class="hint">{{ 'signaturePad.signOnLine' | transloco }}</span>
    </div>
    <div class="actions">
      <div class="left">
        <button mat-stroked-button type="button" [disabled]="!hasStrokes()" (click)="clear()">
          {{ 'treatments.clearSignature' | transloco }}
        </button>
        <span class="tip">{{ 'signaturePad.landscapeTip' | transloco }}</span>
      </div>
      <div class="right">
        <button mat-button type="button" [mat-dialog-close]="null">{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="button" [disabled]="!hasStrokes()" (click)="accept()">
          {{ 'signaturePad.useSignature' | transloco }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        padding: 8px 8px 16px;
        font-variant-numeric: tabular-nums;
      }
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .titles h2 {
        margin-bottom: 0;
        padding-bottom: 0;
      }
      .caption {
        margin: 0 24px;
        color: var(--mat-sys-on-surface-variant);
      }
      .board {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        margin: 16px 24px 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--plate-line-strong);
        border-radius: 14px;
        background: #fff;
        overflow: hidden;
      }
      canvas {
        display: block;
        width: 100%;
        max-height: 100%;
        aspect-ratio: 3 / 1;
        touch-action: none;
        cursor: crosshair;
      }
      .guide,
      .baseline,
      .hint {
        position: absolute;
        pointer-events: none;
      }
      .baseline {
        left: 6%;
        right: 6%;
        bottom: 24%;
        border-bottom: 1.5px solid rgba(28, 28, 25, 0.32);
      }
      .guide {
        left: 5%;
        bottom: calc(24% + 6px);
        font-size: 32px;
        line-height: 1;
        color: rgba(28, 28, 25, 0.32);
      }
      .hint {
        left: 6%;
        bottom: calc(24% - 28px);
        font-size: 14px;
        color: #42474e;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
        padding: 16px 24px 0;
      }
      .left,
      .right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .tip {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .right button {
        min-height: 48px;
      }
    `,
  ],
})
export class SignatureDialogComponent implements AfterViewInit {
  protected readonly data = inject<SignatureDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<SignatureDialogComponent, SignatureDialogResult>);
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  protected surface: SignatureSurface | null = null;
  protected readonly hasStrokes = signal(false);

  ngAfterViewInit(): void {
    // 1500×500 is the inline 600×200 at 2.5×: a stroke of 5 shrinks back to the pad's 2.
    this.surface = new SignatureSurface(this.canvasRef.nativeElement, 5);
    if (this.data.current) {
      this.surface.copyFrom(this.data.current, this.data.currentHasStrokes);
    } else {
      this.surface.clear();
    }
    this.hasStrokes.set(this.surface.strokes);
  }

  protected down(event: PointerEvent): void {
    this.surface?.down(event);
  }

  protected move(event: PointerEvent): void {
    if (this.surface?.move(event)) this.hasStrokes.set(true);
  }

  protected clear(): void {
    this.surface?.clear();
    this.hasStrokes.set(false);
  }

  protected accept(): void {
    this.dialogRef.close({ canvas: this.canvasRef.nativeElement, hasStrokes: this.hasStrokes() });
  }
}
