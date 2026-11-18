import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { parseLegalMarkdown, type LegalSpan } from '@expedientes/shared-types';

/**
 * Renders a legal document's Markdown as headings, paragraphs, lists and tables, with templates
 * only: nothing is injected as HTML, and only http(s) links become links.
 */
@Component({
  selector: 'app-legal-document-view',
  standalone: true,
  template: `
    <ng-template #spansTpl let-spans>
      @for (span of asSpans(spans); track $index) {
        @if (span.href) {
          <a [href]="span.href" target="_blank" rel="noopener">{{ span.text }}</a>
        } @else if (span.bold) {
          <strong>{{ span.text }}</strong>
        } @else {
          {{ span.text }}
        }
      }
    </ng-template>

    <article class="legal">
      @for (block of blocks(); track $index) {
        @switch (block.kind) {
          @case ('heading') {
            @if (block.level === 1) {
              <h2 class="h1"><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: block.spans }" /></h2>
            } @else if (block.level === 2) {
              <h3 class="h2"><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: block.spans }" /></h3>
            } @else {
              <h4 class="h3"><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: block.spans }" /></h4>
            }
          }
          @case ('paragraph') {
            <p><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: block.spans }" /></p>
          }
          @case ('note') {
            <p class="note"><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: block.spans }" /></p>
          }
          @case ('list') {
            @if (block.ordered) {
              <ol>
                @for (item of block.items; track $index) {
                  <li><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: item }" /></li>
                }
              </ol>
            } @else {
              <ul>
                @for (item of block.items; track $index) {
                  <li><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: item }" /></li>
                }
              </ul>
            }
          }
          @case ('table') {
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    @for (cell of block.header; track $index) {
                      <th><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: cell }" /></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of block.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index) {
                        <td><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: cell }" /></td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </article>
  `,
  imports: [NgTemplateOutlet],
  styles: [
    `
      .legal {
        font-size: 14px;
        line-height: 1.6;
      }
      .h1 {
        font-size: 20px;
        margin: 0 0 12px;
      }
      .h2 {
        font-size: 16px;
        margin: 24px 0 8px;
      }
      .h3 {
        font-size: 14px;
        margin: 16px 0 6px;
      }
      p {
        margin: 0 0 10px;
      }
      .note {
        padding: 10px 12px;
        border: 1px dashed var(--plate-line-strong);
        background: var(--mat-sys-surface-container-low);
        border-radius: var(--plate-radius);
      }
      ul,
      ol {
        margin: 0 0 10px;
        padding-left: 22px;
      }
      li {
        margin-bottom: 4px;
      }
      .table-scroll {
        overflow-x: auto;
        margin: 0 0 12px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        font-size: 13px;
      }
      th,
      td {
        border: 1px solid var(--plate-line);
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: var(--mat-sys-surface-container-low);
        font-weight: 600;
      }
      a {
        color: inherit;
      }
    `,
  ],
})
export class LegalDocumentViewComponent {
  readonly markdown = input.required<string>();
  protected readonly blocks = computed(() => parseLegalMarkdown(this.markdown()));
  protected asSpans(value: unknown): LegalSpan[] {
    return value as LegalSpan[];
  }
}
