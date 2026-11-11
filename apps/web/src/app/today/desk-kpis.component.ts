import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import type { TodayKpis } from '@expedientes/shared-types';

/**
 * The four numbers across the top. Each is a link: today's figures apply the matching agenda
 * filter (kept in the URL), tomorrow's opens the calendar. Rose marks only "needs action", and
 * only while it is above zero — the One Mark Rule.
 */
@Component({
  selector: 'app-desk-kpis',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  template: `
    <div class="kpis">
      <a class="kpi" routerLink="." [queryParams]="{ filtro: null }">
        <span class="label">{{ 'today.desk.kpi.today' | transloco }}</span>
        <span class="value">{{ kpis().total }}</span>
        <span class="meta">
          {{ 'today.desk.kpi.todayMeta' | transloco: { done: kpis().done, inConsult: kpis().inConsult } }}
        </span>
      </a>
      <a class="kpi" routerLink="." [queryParams]="{ filtro: null }">
        <span class="label">{{ 'today.desk.kpi.confirmed' | transloco }}</span>
        <span class="value">
          {{ kpis().confirmed }}<span class="of"> / {{ kpis().total }}</span>
        </span>
        <span class="meta">{{ 'today.desk.kpi.confirmedMeta' | transloco: { count: kpis().unconfirmedUpcoming } }}</span>
      </a>
      <a
        class="kpi"
        [class.is-marked]="kpis().needsAction > 0"
        routerLink="."
        [queryParams]="{ filtro: 'accion' }"
      >
        <span class="label">
          @if (kpis().needsAction > 0) {
            <span class="dot" aria-hidden="true"></span>
          }
          {{ 'today.desk.kpi.needsAction' | transloco }}
        </span>
        <span class="value">{{ kpis().needsAction }}</span>
        <span class="meta">
          {{
            'today.desk.kpi.needsActionMeta'
              | transloco
                : {
                    unconfirmed: kpis().unconfirmedUpcoming,
                    consent: kpis().consentPending,
                    historia: kpis().noHistoria,
                  }
          }}
        </span>
      </a>
      <a class="kpi" routerLink="/calendar">
        <span class="label">{{ 'today.desk.kpi.tomorrow' | transloco }}</span>
        <span class="value">{{ kpis().tomorrowTotal }}</span>
        <span class="meta">{{ 'today.desk.kpi.tomorrowMeta' | transloco: { count: kpis().tomorrowUnconfirmed } }}</span>
      </a>
    </div>
  `,
  styles: [
    `
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
        gap: 12px;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-height: 56px;
        padding: 16px 18px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        color: inherit;
        text-decoration: none;
        transition: border-color 150ms ease-out, background-color 150ms ease-out;
      }
      .kpi:hover,
      .kpi:focus-visible {
        border-color: var(--plate-line-strong);
        background: var(--mat-sys-surface-container-low);
      }
      .kpi.is-marked {
        border-color: var(--plate-mark);
      }
      .label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .is-marked .label {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .value {
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 1.1;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .of {
        font-size: 1rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
      }
      .meta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class DeskKpisComponent {
  readonly kpis = input.required<TodayKpis>();
}
