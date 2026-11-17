import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import type { CurrentLegalDocuments, LegalDocumentView } from '@expedientes/shared-types';
import { LegalDocumentDialogComponent } from './legal-document-dialog.component';

/**
 * The acceptance block of the sign-up and invitation screens: two required boxes (privacy notice,
 * terms), unchecked by default, each with a link that opens the document in place, and the optional
 * box for promotions and surveys.
 */
@Component({
  selector: 'app-legal-consent',
  standalone: true,
  imports: [FormsModule, MatCheckboxModule, TranslocoModule],
  template: `
    <div class="consent">
      <mat-checkbox [(ngModel)]="privacy" [ngModelOptions]="{ standalone: true }">
        {{ 'legal.acceptPrivacy' | transloco }}
        <a href="#" (click)="open($event, docs().privacy)">{{ 'legal.privacyNotice' | transloco }}</a>
        <span class="version">v{{ docs().privacy.version }}</span>
      </mat-checkbox>
      <mat-checkbox [(ngModel)]="terms" [ngModelOptions]="{ standalone: true }">
        {{ 'legal.acceptTerms' | transloco }}
        <a href="#" (click)="open($event, docs().terms)">{{ 'legal.terms' | transloco }}</a>
        <span class="version">v{{ docs().terms.version }}</span>
      </mat-checkbox>
      <mat-checkbox [(ngModel)]="marketing" [ngModelOptions]="{ standalone: true }" class="optional">
        {{ 'legal.marketing' | transloco }}
      </mat-checkbox>
    </div>
  `,
  styles: [
    `
      .consent {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 4px 0 12px;
      }
      .version {
        margin-left: 4px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .optional {
        color: var(--mat-sys-on-surface-variant);
      }
      a {
        color: inherit;
        font-weight: 600;
      }
    `,
  ],
})
export class LegalConsentComponent {
  private readonly dialog = inject(MatDialog);

  readonly docs = input.required<CurrentLegalDocuments>();
  readonly privacy = model(false);
  readonly terms = model(false);
  readonly marketing = model(false);

  /** Both required boxes are checked. */
  readonly complete = computed(() => this.privacy() && this.terms());

  protected open(event: Event, doc: LegalDocumentView): void {
    event.preventDefault();
    event.stopPropagation();
    this.dialog.open(LegalDocumentDialogComponent, { data: doc, maxWidth: 720, width: '92vw', maxHeight: '86vh' });
  }
}
