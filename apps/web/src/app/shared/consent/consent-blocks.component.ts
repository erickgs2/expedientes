import { Component, input } from '@angular/core';
import type { ConsentBlock, ConsentSignatureRole } from '@expedientes/shared-types';

/** Renders an assembled consent document — the same `ConsentBlock[]` shape used both for the
 * live preview before signing (`consentPreview`, built from current settings + catalog) and the
 * frozen document after signing (`consentDocument`, rebuilt from the signed snapshot). Purely
 * presentational: it never knows which one it was handed. */
@Component({
  selector: 'app-consent-blocks',
  standalone: true,
  template: `
    <div class="consent-document">
      @for (block of blocks(); track $index) {
        @switch (block.kind) {
          @case ('title') {
            <h2 class="consent-title">{{ block.text }}</h2>
          }
          @case ('fieldLine') {
            <div class="field-line">
              <span class="field-label">{{ block.label }}:</span>
              <span class="field-value">{{ block.value }}</span>
            </div>
          }
          @case ('paragraph') {
            <p class="paragraph">{{ block.text }}</p>
          }
          @case ('sectionHeading') {
            <h3 class="section-heading">{{ block.text }}</h3>
          }
          @case ('signatureBlock') {
            <div class="signature-block">
              @if (signatureUrls()[block.role]; as url) {
                <img class="signature-image" [src]="url" [alt]="block.caption" />
              }
              <div class="signature-line"></div>
              <p class="signature-caption">{{ block.caption }}</p>
              @if (block.subCaption) {
                <p class="signature-subcaption">{{ block.subCaption }}</p>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .consent-document {
        max-width: 700px;
      }
      .consent-title {
        text-align: center;
        margin: 0 0 16px;
      }
      .field-line {
        display: flex;
        gap: 8px;
        margin: 4px 0;
        flex-wrap: wrap;
      }
      .field-label {
        font-weight: 500;
        white-space: nowrap;
      }
      .field-value {
        text-decoration: underline;
        text-underline-offset: 3px;
        flex: 1;
        min-width: 120px;
      }
      .paragraph {
        text-align: justify;
        white-space: pre-wrap;
        margin: 12px 0;
      }
      .section-heading {
        font-weight: bold;
        text-transform: uppercase;
        margin: 20px 0 8px;
      }
      .signature-block {
        margin: 32px 0 16px;
        max-width: 320px;
      }
      .signature-image {
        max-width: 100%;
        max-height: 120px;
        display: block;
        margin-bottom: -8px;
      }
      .signature-line {
        border-top: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.6));
        margin-top: 40px;
      }
      .signature-caption {
        margin: 4px 0 0;
        font-weight: 500;
      }
      .signature-subcaption {
        margin: 0;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
        font-size: 0.9em;
      }
    `,
  ],
})
export class ConsentBlocksComponent {
  readonly blocks = input.required<ConsentBlock[]>();
  readonly signatureUrls = input<Partial<Record<ConsentSignatureRole, string>>>({});
}
