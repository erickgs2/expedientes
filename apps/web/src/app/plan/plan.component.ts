import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { PLAN_LIMITS, type ClinicPlanDetails } from '@expedientes/shared-types';
import { PlanService } from './plan.service';
import { formatBytes, formatMxn, usagePercent } from './plan-format';

interface Meter {
  key: 'users' | 'treatmentTypes' | 'storage';
  used: string;
  max: string | null;
  percent: number;
  /** At or over the limit: what is over keeps working, but nothing new can be added. */
  full: boolean;
}

/** Days before a grant or paid period ends when the screen starts reminding. */
const ENDING_SOON_DAYS = 30;

/**
 * Plan: which plan the clinic is on and until when, how much of each Free limit it uses, and what
 * Premium adds and costs. Online payment arrives with Stripe (phase 5); until then Premium is given
 * by the MedCloud team, so the call to action says so instead of pretending to sell.
 */
@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    @if (loading()) {
      <p>{{ 'common.loading' | transloco }}</p>
    } @else if (!details()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    } @else {
      @let plan = details()!;
      <header class="page-head">
        <h1>{{ 'plan.title' | transloco }}</h1>
        <p>{{ 'plan.subtitle' | transloco }}</p>
      </header>

      <section class="current card" [class.is-premium]="plan.tier === 'PREMIUM'">
        <div class="current-main">
          <span class="badge" [class.badge-premium]="plan.tier === 'PREMIUM'">
            @if (plan.tier === 'PREMIUM') {
              <mat-icon aria-hidden="true">workspace_premium</mat-icon>
            }
            {{ 'plan.tier.' + plan.tier | transloco }}
          </span>
          <p class="current-line">{{ sourceLine() }}</p>
          @if (endingSoon()) {
            <p class="ending">
              <span class="dot" aria-hidden="true"></span>
              {{ 'plan.endingSoon' | transloco: { days: endingSoon() } }}
            </p>
          }
        </div>
      </section>

      <h2 class="section-title">{{ 'plan.usage.title' | transloco }}</h2>
      <section class="meters">
        @for (meter of meters(); track meter.key) {
          <div class="meter card" [class.is-full]="meter.full">
            <span class="meter-label">{{ 'plan.usage.' + meter.key | transloco }}</span>
            <span class="meter-value">
              {{ meter.used }}
              <span class="meter-max">
                @if (meter.max) {
                  {{ 'plan.usage.of' | transloco: { max: meter.max } }}
                } @else {
                  · {{ 'plan.unlimited' | transloco }}
                }
              </span>
            </span>
            @if (meter.max) {
              <div
                class="bar"
                role="meter"
                [attr.aria-valuenow]="meter.percent"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-label]="'plan.usage.' + meter.key | transloco"
              >
                <span [style.width.%]="meter.percent"></span>
              </div>
            }
            @if (meter.full) {
              <span class="meter-note">{{ 'plan.usage.full' | transloco }}</span>
            }
          </div>
        }
      </section>

      <h2 class="section-title">{{ 'plan.compare.title' | transloco }}</h2>
      <section class="compare">
        <div class="tier card" [class.is-current]="plan.tier === 'FREE'">
          <h3>{{ 'plan.tier.FREE' | transloco }}</h3>
          <p class="price">{{ 'plan.compare.freePrice' | transloco }}</p>
          <ul>
            @for (row of freeRows(); track row) {
              <li><mat-icon aria-hidden="true">check</mat-icon>{{ row }}</li>
            }
          </ul>
          @if (plan.tier === 'FREE') {
            <p class="current-tag">{{ 'plan.compare.current' | transloco }}</p>
          }
        </div>

        <div class="tier card tier-premium" [class.is-current]="plan.tier === 'PREMIUM'">
          <h3>
            <mat-icon aria-hidden="true">workspace_premium</mat-icon>
            {{ 'plan.tier.PREMIUM' | transloco }}
          </h3>
          @if (plan.price; as price) {
            <p class="price">
              {{ money(price.monthlyCents) }}
              <span class="per">{{ 'plan.compare.perMonth' | transloco }}</span>
            </p>
            <p class="annual">
              {{ 'plan.compare.annual' | transloco: { amount: money(price.annualCents) } }}
              @if (price.annualDiscountPercent > 0) {
                <span class="save">{{ 'plan.compare.save' | transloco: { percent: price.annualDiscountPercent } }}</span>
              }
            </p>
            <p class="tax">{{ 'plan.compare.taxIncluded' | transloco }}</p>
          }
          <ul>
            @for (row of premiumRows(); track row) {
              <li><mat-icon aria-hidden="true">check</mat-icon>{{ row }}</li>
            }
          </ul>
          @if (plan.tier === 'PREMIUM') {
            <p class="current-tag">{{ 'plan.compare.current' | transloco }}</p>
          } @else {
            <button mat-flat-button disabled>{{ 'plan.compare.buy' | transloco }}</button>
            <p class="soon">{{ 'plan.compare.paymentsSoon' | transloco }}</p>
          }
        </div>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 960px;
      }
      .page-head h1 {
        margin: 0;
      }
      .page-head p {
        margin: 2px 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .card {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        padding: 16px 20px;
      }
      .current.is-premium {
        border-color: var(--plate-mark);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid var(--plate-line-strong);
        font-weight: 600;
        font-size: 14px;
      }
      .badge-premium {
        border-color: var(--plate-mark);
        color: var(--mat-sys-primary);
      }
      .badge mat-icon,
      .tier h3 mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .current-line {
        margin: 10px 0 0;
        font-size: 15px;
      }
      .ending {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0 0;
        color: var(--mat-sys-primary);
        font-weight: 500;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .section-title {
        margin: 28px 0 12px;
        font-size: 16px;
      }
      .meters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .meter {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .meter.is-full {
        border-color: var(--plate-mark);
      }
      .meter-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .meter-value {
        font-size: 20px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .meter-max {
        font-size: 14px;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .bar {
        height: 6px;
        border-radius: 3px;
        background: var(--mat-sys-surface-container-high);
        overflow: hidden;
      }
      .bar span {
        display: block;
        height: 100%;
        background: var(--mat-sys-on-surface-variant);
      }
      .is-full .bar span {
        background: var(--plate-mark);
      }
      .meter-note {
        font-size: 12px;
        color: var(--mat-sys-primary);
      }
      .compare {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
        align-items: start;
      }
      .tier h3 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
      }
      .tier-premium {
        border-color: var(--plate-line-strong);
      }
      .tier.is-current {
        border-color: var(--plate-mark);
      }
      .price {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .per {
        font-size: 14px;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .annual {
        margin: 2px 0 0;
      }
      .save {
        margin-left: 6px;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
        font-size: 12px;
        font-weight: 600;
      }
      .tax,
      .soon {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      ul {
        list-style: none;
        margin: 16px 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      li mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        flex: none;
        color: var(--mat-sys-on-surface-variant);
      }
      .current-tag {
        margin: 0;
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class PlanComponent implements OnInit {
  private readonly planService = inject(PlanService);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(true);
  protected readonly details = signal<ClinicPlanDetails | null>(null);

  private readonly lang = () => this.transloco.getActiveLang();

  protected readonly sourceLine = computed(() => {
    const plan = this.details();
    if (!plan) return '';
    if (plan.tier === 'FREE') return this.transloco.translate('plan.source.FREE');
    return this.transloco.translate(`plan.source.${plan.source}`, {
      date: this.date(plan.premiumUntil),
    });
  });

  /** Days left when Premium ends within a month and nothing renews it on its own; else 0. */
  protected readonly endingSoon = computed(() => {
    const plan = this.details();
    if (!plan?.premiumUntil) return 0;
    const renews = plan.subscription?.status === 'ACTIVE' && plan.subscription.method === 'CARD';
    if (renews) return 0;
    const days = Math.ceil((new Date(plan.premiumUntil).getTime() - Date.now()) / 86_400_000);
    return days <= ENDING_SOON_DAYS ? Math.max(days, 1) : 0;
  });

  protected readonly meters = computed<Meter[]>(() => {
    const plan = this.details();
    if (!plan) return [];
    const lang = this.lang();
    const { limits, usage } = plan;
    const count = (used: number, max: number | null, key: Meter['key']): Meter => ({
      key,
      used: String(used),
      max: max === null ? null : String(max),
      percent: usagePercent(used, max),
      full: max !== null && used >= max,
    });
    return [
      count(usage.users, limits.users, 'users'),
      count(usage.treatmentTypes, limits.treatmentTypes, 'treatmentTypes'),
      {
        key: 'storage',
        used: formatBytes(usage.storageBytes, lang),
        max: formatBytes(limits.storageBytes, lang),
        percent: usagePercent(usage.storageBytes, limits.storageBytes),
        full: usage.storageBytes >= limits.storageBytes,
      },
    ];
  });

  protected readonly freeRows = computed(() => this.rows('FREE'));
  protected readonly premiumRows = computed(() => this.rows('PREMIUM'));

  async ngOnInit(): Promise<void> {
    try {
      this.details.set(await this.planService.get());
    } catch {
      this.details.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected money(cents: number): string {
    return formatMxn(cents, this.lang());
  }

  private date(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(this.lang(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  private rows(tier: 'FREE' | 'PREMIUM'): string[] {
    const limits = PLAN_LIMITS[tier];
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(`plan.compare.rows.${key}`, params);
    const lang = this.lang();
    return [
      limits.users === null ? t('usersUnlimited') : t('users', { count: limits.users }),
      limits.treatmentTypes === null
        ? t('treatmentTypesUnlimited')
        : t('treatmentTypes', { count: limits.treatmentTypes }),
      t('storage', { size: formatBytes(limits.storageBytes, lang) }),
      t('patients'),
      t('pdf'),
      ...(limits.features.whatsappReminders ? [t('whatsapp')] : []),
      ...(limits.features.customRoles ? [t('roles')] : []),
      ...(limits.features.unbrandedPdf ? [t('unbranded')] : []),
    ];
  }
}
