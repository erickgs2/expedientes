import { Component, computed, input, signal } from '@angular/core';
import type { ServerMetricPoint } from '@expedientes/shared-types';

interface Series {
  key: 'cpuPercent' | 'memPercent' | 'diskPercent';
  label: string;
  /** CSS variable holding the series color (validated light and dark palette). */
  color: string;
}

const SERIES: Series[] = [
  { key: 'cpuPercent', label: 'CPU', color: 'var(--chart-series-1)' },
  { key: 'memPercent', label: 'RAM', color: 'var(--chart-series-2)' },
  { key: 'diskPercent', label: 'Disco', color: 'var(--chart-series-3)' },
];

const W = 720;
const H = 240;
const PAD = { top: 12, right: 64, bottom: 28, left: 40 };

/**
 * Server load over the last 24 hours: CPU, RAM and disk as % of the machine, on one 0–100% axis.
 * Lines of 2px, a legend plus direct labels at the line ends, a crosshair tooltip on hover, and a
 * table view of the same data (the aqua series sits under 3:1 contrast in light mode, so it is
 * never identified by color alone).
 */
@Component({
  selector: 'app-server-load-chart',
  standalone: true,
  template: `
    <div class="head">
      <div class="legend" aria-hidden="true">
        @for (s of series; track s.key) {
          <span class="key"><span class="swatch" [style.background]="s.color"></span>{{ s.label }}</span>
        }
      </div>
      <button type="button" class="toggle" (click)="showTable.set(!showTable())">
        {{ showTable() ? 'Ver gráfica' : 'Ver tabla' }}
      </button>
    </div>

    @if (points().length < 2) {
      <p class="empty">Aún no hay suficientes muestras. Se guarda una cada 5 minutos.</p>
    } @else if (showTable()) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Hora</th><th>CPU</th><th>RAM</th><th>Disco</th></tr>
          </thead>
          <tbody>
            @for (row of hourly(); track row.takenAt) {
              <tr>
                <td>{{ time(row.takenAt) }}</td>
                <td>{{ row.cpuPercent.toFixed(1) }}%</td>
                <td>{{ row.memPercent.toFixed(1) }}%</td>
                <td>{{ row.diskPercent.toFixed(1) }}%</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="plot">
        <svg
          [attr.viewBox]="'0 0 ' + W + ' ' + H"
          role="img"
          aria-label="Carga del servidor en las últimas 24 horas: CPU, RAM y disco en porcentaje"
          (pointermove)="hover($event)"
          (pointerleave)="active.set(null)"
        >
          @for (tick of yTicks; track tick) {
            <line class="grid" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="y(tick)" [attr.y2]="y(tick)" />
            <text class="axis" [attr.x]="PAD.left - 8" [attr.y]="y(tick) + 4" text-anchor="end">{{ tick }}%</text>
          }
          @for (tick of xTicks(); track tick.x) {
            <text class="axis" [attr.x]="tick.x" [attr.y]="H - 8" text-anchor="middle">{{ tick.label }}</text>
          }
          @for (s of series; track s.key) {
            <path class="line" [attr.d]="path(s.key)" [style.stroke]="s.color" />
            <text class="end-label" [attr.x]="W - PAD.right + 8" [attr.y]="endLabelY(s.key)">
              {{ s.label }} {{ last()[s.key].toFixed(0) }}%
            </text>
          }
          @if (active(); as i) {
            <line class="crosshair" [attr.x1]="x(i)" [attr.x2]="x(i)" [attr.y1]="PAD.top" [attr.y2]="H - PAD.bottom" />
            @for (s of series; track s.key) {
              <circle class="marker" [attr.cx]="x(i)" [attr.cy]="y(points()[i][s.key])" r="4" [style.fill]="s.color" />
            }
          }
        </svg>
        @if (active(); as i) {
          <div class="tooltip" [style.left.%]="(x(i) / W) * 100" [class.flip]="x(i) > W * 0.6">
            <div class="tt-time">{{ time(points()[i].takenAt) }}</div>
            @for (s of series; track s.key) {
              <div class="tt-row">
                <span class="swatch" [style.background]="s.color"></span>
                <span class="tt-label">{{ s.label }}</span>
                <span class="tt-value">{{ points()[i][s.key].toFixed(1) }}%</span>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .legend {
        display: flex;
        gap: 14px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .key {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        display: inline-block;
      }
      .toggle {
        border: 1px solid var(--plate-line);
        background: none;
        color: var(--mat-sys-on-surface);
        border-radius: 6px;
        padding: 4px 10px;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .plot {
        position: relative;
      }
      svg {
        width: 100%;
        height: auto;
        display: block;
        touch-action: none;
      }
      .grid {
        stroke: var(--plate-line);
        stroke-width: 1;
      }
      .axis,
      .end-label {
        font-size: 11px;
        fill: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .end-label {
        fill: var(--mat-sys-on-surface);
      }
      .line {
        fill: none;
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .crosshair {
        stroke: var(--plate-line-strong);
        stroke-width: 1;
      }
      .marker {
        stroke: var(--mat-sys-surface);
        stroke-width: 2;
      }
      .tooltip {
        position: absolute;
        top: 8px;
        transform: translateX(12px);
        background: var(--mat-sys-surface-container-high);
        border: 1px solid var(--plate-line);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        pointer-events: none;
        min-width: 120px;
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
      }
      .tooltip.flip {
        transform: translateX(calc(-100% - 12px));
      }
      .tt-time {
        color: var(--mat-sys-on-surface-variant);
        margin-bottom: 4px;
      }
      .tt-row {
        display: grid;
        grid-template-columns: 10px 1fr auto;
        align-items: center;
        gap: 6px;
      }
      .tt-value {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .empty {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
        padding: 32px 0;
        text-align: center;
      }
      .table-wrap {
        max-height: 260px;
        overflow-y: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      th,
      td {
        text-align: right;
        padding: 4px 8px;
        border-bottom: 1px solid var(--plate-line);
      }
      th:first-child,
      td:first-child {
        text-align: left;
      }
    `,
  ],
})
export class ServerLoadChartComponent {
  readonly points = input<ServerMetricPoint[]>([]);

  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;
  protected readonly series = SERIES;
  protected readonly yTicks = [0, 25, 50, 75, 100];
  protected readonly active = signal<number | null>(null);
  protected readonly showTable = signal(false);

  protected readonly last = computed(() => this.points()[this.points().length - 1]);

  /** One row per hour for the table view, newest first. */
  protected readonly hourly = computed(() => {
    const byHour = new Map<string, ServerMetricPoint>();
    for (const p of this.points()) byHour.set(p.takenAt.slice(0, 13), p);
    return [...byHour.values()].reverse();
  });

  private readonly range = computed(() => {
    const pts = this.points();
    const start = new Date(pts[0]?.takenAt ?? Date.now()).getTime();
    const end = new Date(pts[pts.length - 1]?.takenAt ?? Date.now()).getTime();
    return { start, end: Math.max(end, start + 1) };
  });

  protected x(i: number): number {
    const { start, end } = this.range();
    const t = new Date(this.points()[i].takenAt).getTime();
    return PAD.left + ((t - start) / (end - start)) * (W - PAD.left - PAD.right);
  }

  protected y(value: number): number {
    return PAD.top + (1 - Math.min(100, Math.max(0, value)) / 100) * (H - PAD.top - PAD.bottom);
  }

  protected path(key: Series['key']): string {
    return this.points()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${this.x(i).toFixed(1)},${this.y(p[key]).toFixed(1)}`)
      .join(' ');
  }

  /** End labels nudged apart so close values do not overlap. */
  protected endLabelY(key: Series['key']): number {
    const placed = [...SERIES]
      .map((s) => ({ key: s.key, y: this.y(this.last()[s.key]) + 4 }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) {
      if (placed[i].y - placed[i - 1].y < 13) placed[i].y = placed[i - 1].y + 13;
    }
    return placed.find((p) => p.key === key)?.y ?? 0;
  }

  protected xTicks(): Array<{ x: number; label: string }> {
    const pts = this.points();
    if (pts.length < 2) return [];
    const ticks: Array<{ x: number; label: string }> = [];
    const step = Math.max(1, Math.floor(pts.length / 6));
    for (let i = 0; i < pts.length; i += step) ticks.push({ x: this.x(i), label: this.time(pts[i].takenAt) });
    return ticks;
  }

  protected hover(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let best = 0;
    let bestDist = Infinity;
    this.points().forEach((_, i) => {
      const d = Math.abs(this.x(i) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    this.active.set(best);
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
