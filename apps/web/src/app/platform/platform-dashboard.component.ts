import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlatformOverview } from '@expedientes/shared-types';
import { PlatformService } from './platform.service';
import { ServerLoadChartComponent } from './server-load-chart.component';
import { bytes, mxn } from './format';

/**
 * The portal's front page: how many clinics and on which plan, revenue and conversion, and how hard
 * the server is working. Counts only; nothing about any patient.
 */
@Component({
  selector: 'app-platform-dashboard',
  standalone: true,
  imports: [RouterLink, ServerLoadChartComponent],
  template: `
    <h1 class="title">Panel</h1>

    @if (data(); as d) {
      <section class="summary" aria-label="Clínicas">
        <a routerLink="/plataforma/clinicas" class="stat">
          <span class="value">{{ d.clinics.total }}</span>
          <span class="label">Clínicas</span>
          <span class="sub">{{ d.clinics.new7d }} nuevas en 7 días · {{ d.clinics.new30d }} en 30</span>
        </a>
        <a routerLink="/plataforma/clinicas" [queryParams]="{ tab: 'free' }" class="stat">
          <span class="value">{{ d.clinics.free }}</span>
          <span class="label">En Gratis</span>
          <span class="sub">{{ d.clinics.suspended }} suspendidas en total</span>
        </a>
        <a routerLink="/plataforma/clinicas" [queryParams]="{ tab: 'premium' }" class="stat">
          <span class="value">{{ d.clinics.premium }}</span>
          <span class="label">En Premium</span>
          <span class="sub">{{ d.clinics.premiumPaid }} de pago · {{ d.clinics.premiumGranted }} por concesión</span>
        </a>
        <div class="stat">
          <span class="value">{{ money(d.mrrCents) }}</span>
          <span class="label">Ingreso mensual estimado</span>
          <span class="sub">{{ d.paidConversionPercent }}% de las clínicas pagan</span>
        </div>
      </section>

      <section class="server plate" aria-label="Servidor">
        <div class="server-head">
          <h2>Servidor</h2>
          @if (d.server; as s) {
            <span class="uptime">Encendido hace {{ uptime(s.uptimeSeconds) }}</span>
          }
        </div>
        @if (d.server; as s) {
          <dl class="now">
            <div><dt>CPU</dt><dd>{{ s.cpuPercent }}%</dd></div>
            <div><dt>RAM</dt><dd>{{ s.memPercent }}% <small>{{ size(s.memUsedBytes) }} de {{ size(s.memTotalBytes) }}</small></dd></div>
            <div><dt>Disco</dt><dd>{{ s.diskPercent }}% <small>{{ size(s.diskUsedBytes) }} de {{ size(s.diskTotalBytes) }}</small></dd></div>
            <div><dt>Base de datos</dt><dd>{{ size(s.dbSizeBytes) }}</dd></div>
            <div><dt>Memoria del API</dt><dd>{{ size(s.processRssBytes) }}</dd></div>
          </dl>
        }
        <h3 class="chart-title">Últimas 24 horas</h3>
        <app-server-load-chart [points]="d.series" />
      </section>
    } @else if (failed()) {
      <p class="muted">No se pudo cargar el panel.</p>
    } @else {
      <div class="summary" aria-hidden="true">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="stat"><span class="skeleton" style="width: 48px; height: 28px"></span><span class="skeleton" style="width: 96px; height: 12px; margin-top: 8px"></span></div>
        }
      </div>
      <div class="plate skeleton-plate" aria-hidden="true"><span class="skeleton" style="height: 220px"></span></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1120px;
      }
      .title {
        font-size: 1.875rem;
        font-weight: 700;
        letter-spacing: -0.015em;
        margin: 0 0 20px;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        margin-bottom: 24px;
        overflow: hidden;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 16px 20px;
        color: inherit;
        text-decoration: none;
        border-left: 1px solid var(--plate-line);
        margin-left: -1px;
      }
      a.stat:hover,
      a.stat:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .value {
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 1.1;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .label {
        font-size: 14px;
        font-weight: 500;
      }
      .sub {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .plate {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        padding: 20px;
      }
      .server-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }
      .uptime {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .now {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 32px;
        margin: 16px 0 20px;
      }
      dt {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 2px 0 0;
        font-size: 17px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      dd small {
        font-size: 12px;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .chart-title {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 4px;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .skeleton-plate .skeleton {
        width: 100%;
      }
    `,
  ],
})
export class PlatformDashboardComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly data = signal<PlatformOverview | null>(null);
  protected readonly failed = signal(false);
  protected readonly money = mxn;
  protected readonly size = bytes;

  async ngOnInit(): Promise<void> {
    try {
      this.data.set(await this.platform.overview());
    } catch {
      this.failed.set(true);
    }
  }

  protected uptime(seconds: number): string {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    return days > 0 ? `${days} d ${hours} h` : `${hours} h ${Math.floor((seconds % 3_600) / 60)} min`;
  }
}
