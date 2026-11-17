import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import type { LegalDocumentPage } from '@expedientes/shared-types';
import { LegalService } from './legal.service';
import { LegalDocumentViewComponent } from './legal-document-view.component';

/**
 * Public pages /privacidad and /terminos: the version in force (or `?version=`), and every version
 * published so far, so anyone can see what they accepted.
 */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink, TranslocoModule, LegalDocumentViewComponent],
  template: `
    <div class="page">
      @if (page(); as data) {
        <p class="meta">
          {{ 'legal.version' | transloco: { version: data.document.version, date: date(data.document.effectiveFrom) } }}
        </p>
        <app-legal-document-view [markdown]="data.document.body" />
        @if (data.versions.length > 1) {
          <section class="history">
            <h2>{{ 'legal.history' | transloco }}</h2>
            <ul>
              @for (v of data.versions; track v.id) {
                <li>
                  <a [routerLink]="[]" [queryParams]="{ version: v.version }">v{{ v.version }}</a>
                  · {{ date(v.effectiveFrom) }} · {{ v.changeSummary }}
                </li>
              }
            </ul>
          </section>
        }
      } @else if (failed()) {
        <p>{{ 'common.loadError' | transloco }}</p>
      } @else {
        <p>{{ 'common.loading' | transloco }}</p>
      }
      <p class="back"><a routerLink="/login">{{ 'legal.backToLogin' | transloco }}</a></p>
    </div>
  `,
  styles: [
    `
      .page {
        max-width: 760px;
        margin: 0 auto;
        padding: 32px 16px 48px;
      }
      .meta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 16px;
      }
      .history {
        margin-top: 32px;
        border-top: 1px solid var(--plate-line);
        padding-top: 16px;
      }
      .history h2 {
        font-size: 15px;
      }
      .history ul {
        padding-left: 18px;
        font-size: 13px;
      }
      .back {
        margin-top: 32px;
        font-size: 14px;
      }
      a {
        color: inherit;
      }
    `,
  ],
})
export class LegalPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly legal = inject(LegalService);
  protected readonly page = signal<LegalDocumentPage | null>(null);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    const kind = this.route.snapshot.data['kind'] as 'privacy' | 'terms';
    this.route.queryParamMap.subscribe(async (params) => {
      this.failed.set(false);
      try {
        this.page.set(await this.legal.page(kind, params.get('version') ?? undefined));
      } catch {
        this.failed.set(true);
      }
    });
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
