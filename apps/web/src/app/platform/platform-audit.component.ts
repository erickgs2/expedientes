import { Component, OnInit, inject, signal } from '@angular/core';
import type { PlatformAuditEntry } from '@expedientes/shared-types';
import { PlatformService } from './platform.service';
import { dateTime } from './format';

const ACTIONS: Record<string, string> = {
  'session.login': 'Inició sesión',
  'session.enrol': 'Activó la verificación en dos pasos',
  'clinic.suspend': 'Suspendió una clínica',
  'clinic.reactivate': 'Reactivó una clínica',
  'clinics.export': 'Exportó la lista de clínicas',
  'grant.create': 'Dio Premium',
  'grant.revoke': 'Revocó una concesión',
  'price.create': 'Cambió el precio',
  'legal.publish': 'Publicó un documento legal',
};

/** Every action taken from the portal, newest first. */
@Component({
  selector: 'app-platform-audit',
  standalone: true,
  template: `
    <h1 class="title">Bitácora</h1>
    @if (entries(); as list) {
      @if (list.length === 0) {
        <p class="empty">Todavía no hay acciones registradas.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
            <tbody>
              @for (e of list; track e.id) {
                <tr>
                  <td class="num">{{ stamp(e.createdAt) }}</td>
                  <td>{{ e.adminEmail }}</td>
                  <td>{{ action(e.action) }}</td>
                  <td class="detail">{{ detail(e) }}</td>
                  <td class="num">{{ e.ip ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <span class="skeleton" style="height: 200px"></span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1280px;
      }
      .title {
        font-size: 1.875rem;
        font-weight: 700;
        letter-spacing: -0.015em;
        margin: 0 0 20px;
      }
      .table-wrap {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        overflow-x: auto;
        background: var(--mat-sys-surface);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th {
        text-align: left;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        padding: 10px 12px;
        border-bottom: 1px solid var(--plate-line-strong);
      }
      td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--plate-line);
        vertical-align: top;
      }
      tbody tr:last-child td {
        border-bottom: 0;
      }
      .num {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .detail {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        max-width: 480px;
      }
      .empty {
        padding: 32px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
    `,
  ],
})
export class PlatformAuditComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly entries = signal<PlatformAuditEntry[] | null>(null);
  protected readonly stamp = dateTime;

  async ngOnInit(): Promise<void> {
    this.entries.set(await this.platform.audit());
  }

  protected action(code: string): string {
    return ACTIONS[code] ?? code;
  }

  protected detail(entry: PlatformAuditEntry): string {
    const d = (entry.details ?? {}) as Record<string, unknown>;
    switch (entry.action) {
      case 'grant.create': {
        const granted = Array.isArray(d['granted']) ? d['granted'].length : 0;
        return `${d['months']} meses a ${granted} ${granted === 1 ? 'clínica' : 'clínicas'} · ${d['reason'] ?? ''}`;
      }
      case 'grant.revoke':
      case 'clinic.suspend':
        return String(d['reason'] ?? '');
      case 'price.create':
        return `${Number(d['monthlyCents']) / 100} MXN al mes, ${d['annualDiscountPercent']}% anual`;
      case 'legal.publish':
        return `${d['kind'] === 'PRIVACY' ? 'Aviso de privacidad' : 'Términos'} v${d['version']} · ${d['recipients']} avisos`;
      case 'clinics.export':
        return `${d['count']} clínicas`;
      default:
        return '';
    }
  }
}
