import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
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

      @if (returnNotice(); as notice) {
        <p class="notice" role="status">{{ 'plan.return.' + notice | transloco: { days: plan.billing.oxxoVoucherDays } }}</p>
      }

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
          }
          @if (!plan.billing.enabled) {
            @if (plan.tier !== 'PREMIUM') {
              <button mat-flat-button disabled>{{ 'plan.compare.buy' | transloco }}</button>
              <p class="soon">{{ 'plan.compare.paymentsSoon' | transloco }}</p>
            }
          } @else if (!plan.billing.isOwner) {
            <p class="soon">{{ 'plan.buy.ownerOnly' | transloco }}</p>
          } @else if (paysByCard()) {
            <p class="billing-state">{{ cardStateLine() }}</p>
            <button mat-stroked-button [disabled]="redirecting()" (click)="openPortal()">
              {{ 'plan.buy.manage' | transloco }}
            </button>
          } @else {
            <div class="interval" role="radiogroup" [attr.aria-label]="'plan.buy.interval' | transloco">
              <button type="button" role="radio" [attr.aria-checked]="interval() === 'YEAR'" [class.on]="interval() === 'YEAR'" (click)="interval.set('YEAR')">
                {{ 'plan.buy.yearly' | transloco }}
              </button>
              <button type="button" role="radio" [attr.aria-checked]="interval() === 'MONTH'" [class.on]="interval() === 'MONTH'" (click)="interval.set('MONTH')">
                {{ 'plan.buy.monthly' | transloco }}
              </button>
            </div>
            <div class="pay">
              <button mat-flat-button [disabled]="redirecting()" (click)="buy('CARD')">
                {{ (paysByOxxo() ? 'plan.buy.switchToCard' : 'plan.buy.card') | transloco }}
              </button>
              <button mat-stroked-button [disabled]="redirecting()" (click)="buy('OXXO')">
                {{ (paysByOxxo() ? 'plan.buy.renewOxxo' : 'plan.buy.oxxo') | transloco }}
              </button>
            </div>
            <p class="soon">
              {{ 'plan.buy.cardNote' | transloco }}
              {{ 'plan.buy.oxxoNote' | transloco: { days: plan.billing.oxxoVoucherDays } }}
            </p>
          }
          @if (buyError()) {
            <p class="buy-error" role="alert">{{ buyError() }}</p>
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
      .notice {
        padding: 12px 16px;
        border: 1px solid var(--plate-line-strong);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface-container-low);
        margin: 0 0 20px;
      }
      .interval {
        display: inline-flex;
        border: 1px solid var(--plate-line-strong);
        border-radius: 999px;
        padding: 2px;
        margin: 0 0 12px;
      }
      .interval button {
        border: 0;
        background: none;
        color: var(--mat-sys-on-surface-variant);
        font: inherit;
        font-size: 13px;
        padding: 6px 14px;
        border-radius: 999px;
        cursor: pointer;
        min-height: 32px;
      }
      .interval button.on {
        background: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .pay {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 4px;
      }
      .billing-state {
        margin: 0 0 8px;
        font-size: 14px;
      }
      .buy-error {
        margin: 8px 0 0;
        color: var(--mat-sys-error);
        font-size: 13px;
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

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly interval = signal<'MONTH' | 'YEAR'>('YEAR');
  protected readonly redirecting = signal(false);
  protected readonly buyError = signal<string | null>(null);
  /** What to say after coming back from Stripe Checkout. */
  protected readonly returnNotice = signal<'cardProcessing' | 'cardDone' | 'oxxo' | 'canceled' | null>(null);

  protected readonly paysByCard = computed(() => {
    const sub = this.details()?.subscription;
    return !!sub && sub.method === 'CARD' && this.details()?.source === 'SUBSCRIPTION';
  });

  protected readonly paysByOxxo = computed(() => {
    const sub = this.details()?.subscription;
    return !!sub && sub.method === 'OXXO' && this.details()?.source === 'SUBSCRIPTION';
  });

  protected readonly cardStateLine = computed(() => {
    const sub = this.details()?.subscription;
    if (!sub) return '';
    const date = this.date(sub.currentPeriodEnd);
    const key = sub.status === 'PAST_DUE' ? 'pastDue' : sub.status === 'CANCELED' ? 'canceling' : 'renews';
    return this.transloco.translate(`plan.buy.state.${key}`, { date, until: this.date(this.details()?.premiumUntil ?? null) });
  });

  async ngOnInit(): Promise<void> {
    try {
      this.details.set(await this.planService.get());
    } catch {
      this.details.set(null);
    } finally {
      this.loading.set(false);
    }
    await this.handleReturn();
  }

  /**
   * Back from Stripe: an OXXO voucher only becomes Premium when the store confirms the payment; a
   * card is usually confirmed within seconds by the webhook, so the plan is re-read a few times.
   */
  private async handleReturn(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const result = params.get('pago');
    if (!result) return;
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    if (result === 'cancelado') {
      this.returnNotice.set('canceled');
      return;
    }
    if (params.get('metodo') === 'oxxo') {
      this.returnNotice.set('oxxo');
      return;
    }
    this.returnNotice.set('cardProcessing');
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const fresh = await this.planService.get().catch(() => null);
      if (fresh?.source === 'SUBSCRIPTION' && fresh.subscription?.method === 'CARD') {
        this.details.set(fresh);
        this.returnNotice.set('cardDone');
        // The session's plan (features shown across the app) is refreshed too.
        await this.auth.restoreSession();
        return;
      }
    }
  }

  protected async buy(method: 'CARD' | 'OXXO'): Promise<void> {
    this.redirecting.set(true);
    this.buyError.set(null);
    try {
      window.location.href = await this.planService.checkout(this.interval(), method);
    } catch (error) {
      const code = (error as { error?: { error?: { code?: string } } }).error?.error?.code;
      this.buyError.set(this.transloco.translate(`plan.buy.errors.${code === 'ALREADY_SUBSCRIBED' ? code : 'UNKNOWN'}`));
      this.redirecting.set(false);
    }
  }

  protected async openPortal(): Promise<void> {
    this.redirecting.set(true);
    try {
      window.location.href = await this.planService.portal();
    } catch {
      this.buyError.set(this.transloco.translate('plan.buy.errors.UNKNOWN'));
      this.redirecting.set(false);
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
