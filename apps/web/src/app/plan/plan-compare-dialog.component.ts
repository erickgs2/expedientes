import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { PlanPriceSummary } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { PlanService } from './plan.service';
import { planCompareRows } from './plan-compare';
import { formatMxn } from './plan-format';

/**
 * Free next to Premium in one table, with Premium's monthly and yearly price, opened from the
 * header. It informs and leads to the Plan screen, where buying happens; it sells nothing itself.
 */
@Component({
  selector: 'app-plan-compare-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'plan.compareDialog.title' | transloco }}</h2>
    <mat-dialog-content>
      <p class="lead">{{ 'plan.compareDialog.lead' | transloco }}</p>

      <table class="compare">
        <caption class="cdk-visually-hidden">{{ 'plan.compareDialog.title' | transloco }}</caption>
        <thead>
          <tr>
            <th scope="col" class="feature-col"></th>
            <th scope="col" class="tier">
              <span class="tier-name">{{ 'plan.tier.FREE' | transloco }}</span>
              <span class="tier-price">{{ money(0) }}</span>
              @if (isFree()) {
                <span class="tier-note">{{ 'plan.compareDialog.yours' | transloco }}</span>
              }
            </th>
            <th scope="col" class="tier premium">
              <span class="tier-name">
                <mat-icon aria-hidden="true">workspace_premium</mat-icon>{{ 'plan.tier.PREMIUM' | transloco }}
              </span>
              @if (loading()) {
                <span class="skeleton price-skeleton" aria-hidden="true"></span>
                <span class="skeleton note-skeleton" aria-hidden="true"></span>
              } @else if (price(); as p) {
                <span class="tier-price">
                  {{ money(p.monthlyCents) }} <span class="per">{{ 'plan.compare.perMonth' | transloco }}</span>
                </span>
                <span class="tier-note">
                  {{ 'plan.compare.annual' | transloco: { amount: money(p.annualCents) } }}
                  @if (p.annualDiscountPercent > 0) {
                    · <strong>{{ 'plan.compare.save' | transloco: { percent: p.annualDiscountPercent } }}</strong>
                  }
                </span>
              }
            </th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.key) {
            <tr [class.differs]="row.free !== row.premium">
              <th scope="row">{{ 'plan.compareDialog.rows.' + row.key | transloco }}</th>
              @for (value of [row.free, row.premium]; track $index) {
                <td [class.premium]="$index === 1">
                  @if (value === true) {
                    <mat-icon class="yes" role="img" aria-hidden="false" [attr.aria-label]="'plan.compareDialog.included' | transloco">check</mat-icon>
                  } @else if (value === false) {
                    <mat-icon class="no" role="img" aria-hidden="false" [attr.aria-label]="'plan.compareDialog.notIncluded' | transloco">remove</mat-icon>
                  } @else {
                    {{ value }}
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>

      <p class="foot">
        @if (price()) {
          {{ 'plan.compare.taxIncluded' | transloco }}.
        }
        {{ 'plan.compareDialog.howToPay' | transloco }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'plan.upgrade.notNow' | transloco }}</button>
      <button mat-flat-button (click)="openPlan()">{{ 'plan.compareDialog.seePlans' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .lead {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .compare {
        width: 100%;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
      }
      th,
      td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--plate-line);
        text-align: center;
        vertical-align: middle;
      }
      tbody th {
        text-align: left;
        font-weight: 400;
        color: var(--mat-sys-on-surface);
      }
      .feature-col {
        width: 44%;
      }
      thead th {
        vertical-align: bottom;
        border-bottom-color: var(--plate-line-strong);
        padding-bottom: 12px;
      }
      .tier {
        text-align: center;
      }
      .tier > span {
        display: block;
      }
      .tier-name {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-weight: 600;
        width: 100%;
      }
      .tier-name mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--plate-mark);
      }
      .tier-price {
        margin-top: 4px;
        white-space: nowrap;
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .per {
        font-size: 0.8125rem;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .tier-note {
        margin-top: 2px;
        font-size: 0.75rem;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .tier-note strong {
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      /* Premium's column is set on the proof-grey tone, so the eye reads it as one column. */
      .premium {
        background: var(--mat-sys-surface-container-low);
      }
      thead .premium {
        border-radius: var(--plate-radius) var(--plate-radius) 0 0;
      }
      tr.differs td.premium {
        font-weight: 600;
      }
      mat-icon.yes {
        color: var(--mat-sys-on-surface);
        vertical-align: middle;
      }
      mat-icon.no {
        color: var(--plate-line-strong);
        vertical-align: middle;
      }
      .price-skeleton {
        width: 96px;
        height: 22px;
        margin: 6px auto 0;
      }
      .note-skeleton {
        width: 128px;
        height: 12px;
        margin: 6px auto 0;
      }
      .foot {
        margin: 12px 0 0;
        font-size: 0.8125rem;
        color: var(--mat-sys-on-surface-variant);
      }
      @media (max-width: 479px) {
        th,
        td {
          padding: 8px 6px;
        }
        .tier-price {
          font-size: 1.0625rem;
        }
        .feature-col {
          width: 38%;
        }
      }
    `,
  ],
})
export class PlanCompareDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PlanCompareDialogComponent>);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly loading = signal(true);
  protected readonly price = signal<PlanPriceSummary | null>(null);
  protected readonly isFree = computed(() => this.auth.plan()?.tier !== 'PREMIUM');
  protected readonly rows = computed(() =>
    planCompareRows((key, params) => this.transloco.translate(key, params), this.lang())
  );

  constructor() {
    inject(PlanService)
      .get()
      .then((details) => this.price.set(details.price))
      .catch(() => this.price.set(null))
      .finally(() => this.loading.set(false));
  }

  protected money(cents: number): string {
    return formatMxn(cents, this.lang());
  }

  protected openPlan(): void {
    this.dialogRef.close();
    void this.router.navigate(['/admin/plan']);
  }
}
