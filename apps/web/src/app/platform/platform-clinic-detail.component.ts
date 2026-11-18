import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { PlatformClinicDetail } from '@expedientes/shared-types';
import { PlatformService } from './platform.service';
import { GrantPremiumDialogComponent } from './grant-premium-dialog.component';
import { ReasonDialogComponent, type ReasonDialogData } from './reason-dialog.component';
import { bytes, dateTime, mxn, shortDate } from './format';

/** One clinic: plan, counts, contact, suspension, and the history of manual grants. */
@Component({
  selector: 'app-platform-clinic-detail',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <a routerLink="/plataforma/clinicas" class="back"><mat-icon>arrow_back</mat-icon>Clínicas</a>
    @if (clinic(); as c) {
      <div class="head">
        <div>
          <h1 class="title">{{ c.name }}</h1>
          <p class="meta">
            {{ c.ownerEmail ?? 'Sin propietario' }} · {{ c.phone ?? 'sin teléfono' }} · alta {{ date(c.createdAt) }} · {{ c.timeZone }}
          </p>
        </div>
        <div class="actions">
          <button mat-flat-button (click)="grant(c)"><mat-icon>workspace_premium</mat-icon> Dar Premium</button>
          @if (c.status === 'ACTIVE') {
            <button mat-stroked-button color="warn" (click)="suspend(c)">Suspender</button>
          } @else {
            <button mat-stroked-button (click)="reactivate(c)">Reactivar</button>
          }
        </div>
      </div>

      @if (c.status === 'SUSPENDED') {
        <p class="suspended">Clínica suspendida: nadie de la clínica puede entrar y sus mensajes de WhatsApp están detenidos. Sus datos siguen intactos.</p>
      }

      <dl class="facts">
        <div><dt>Plan</dt><dd>{{ c.tier === 'PREMIUM' ? 'Premium' : 'Gratis' }}</dd></div>
        <div><dt>Origen</dt><dd>{{ c.source === 'GRANT' ? 'Concesión manual' : c.source === 'SUBSCRIPTION' ? 'Pago' : '—' }}</dd></div>
        <div><dt>Premium hasta</dt><dd>{{ c.tier === 'PREMIUM' ? date(c.premiumUntil) : '—' }}</dd></div>
        <div><dt>Usuarios activos</dt><dd>{{ c.users }}</dd></div>
        <div><dt>Pacientes</dt><dd>{{ c.patients }}</dd></div>
        <div><dt>Tipos de tratamiento</dt><dd>{{ c.treatmentTypes }}</dd></div>
        <div><dt>Consentimientos</dt><dd>{{ c.consents }}</dd></div>
        <div><dt>Fotos y documentos</dt><dd>{{ size(c.storageBytes) }}</dd></div>
        <div><dt>Última actividad</dt><dd>{{ c.lastActivityAt ? stamp(c.lastActivityAt) : '—' }}</dd></div>
      </dl>

      <h2>Concesiones de Premium</h2>
      @if (c.grants.length === 0) {
        <p class="empty">Nunca se le ha dado Premium a mano.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Periodo</th><th class="num">Meses</th><th>Motivo</th><th>Otorgó</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (g of c.grants; track g.id) {
                <tr>
                  <td class="num">{{ date(g.startsAt) }} – {{ date(g.endsAt) }}</td>
                  <td class="num">{{ g.months }}</td>
                  <td>{{ g.reason }}</td>
                  <td>{{ g.grantedBy }}</td>
                  <td>
                    @if (g.revokedAt) {
                      Revocada {{ date(g.revokedAt) }}<span class="why">{{ g.revokedReason }}</span>
                    } @else if (isOver(g.endsAt)) {
                      Terminada
                    } @else if (isFuture(g.startsAt)) {
                      Programada
                    } @else {
                      Vigente
                    }
                  </td>
                  <td>
                    @if (!g.revokedAt && !isOver(g.endsAt)) {
                      <button mat-button color="warn" (click)="revoke(g.id)">Revocar</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <h2 class="payments-title">Pagos</h2>
      @if (c.payments.length === 0) {
        <p class="empty">Sin pagos en línea.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th class="num">Monto</th></tr></thead>
            <tbody>
              @for (p of c.payments; track p.id) {
                <tr>
                  <td class="num">{{ stamp(p.receivedAt) }}</td>
                  <td>{{ p.summary ?? p.type }}</td>
                  <td class="num amount">{{ p.amountCents !== null ? money(p.amountCents) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <span class="skeleton" style="width: 280px; height: 32px; margin-top: 12px"></span>
      <span class="skeleton" style="height: 120px; margin-top: 20px"></span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1120px;
      }
      .back {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--mat-sys-on-surface-variant);
        text-decoration: none;
        font-size: 14px;
      }
      .back mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin: 8px 0 16px;
      }
      .title {
        font-size: 1.875rem;
        font-weight: 700;
        letter-spacing: -0.015em;
        margin: 0;
      }
      .meta {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .suspended {
        padding: 12px 16px;
        border: 1px solid var(--mat-sys-error);
        border-radius: var(--plate-radius);
        color: var(--mat-sys-error);
        margin: 0 0 16px;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 16px 24px;
        padding: 20px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        margin: 0 0 28px;
      }
      dt {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 2px 0 0;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 12px;
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
      }
      tbody tr:last-child td {
        border-bottom: 0;
      }
      .num {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      th.num,
      td.num:nth-child(2) {
        text-align: right;
      }
      .payments-title {
        margin-top: 28px;
      }
      td.amount {
        text-align: right;
      }
      .why {
        display: block;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty {
        padding: 24px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
        border: 1px dashed var(--plate-line-strong);
        border-radius: var(--plate-radius);
      }
    `,
  ],
})
export class PlatformClinicDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly platform = inject(PlatformService);
  private readonly dialog = inject(MatDialog);
  protected readonly clinic = signal<PlatformClinicDetail | null>(null);
  protected readonly date = shortDate;
  protected readonly stamp = dateTime;
  protected readonly size = bytes;
  protected readonly money = mxn;

  ngOnInit(): void {
    void this.load();
  }

  protected isOver(iso: string): boolean {
    return new Date(iso) <= new Date();
  }

  protected isFuture(iso: string): boolean {
    return new Date(iso) > new Date();
  }

  protected grant(c: PlatformClinicDetail): void {
    this.dialog
      .open(GrantPremiumDialogComponent, { data: [c], width: '560px', maxWidth: '94vw' })
      .afterClosed()
      .subscribe((done) => done && void this.load());
  }

  protected suspend(c: PlatformClinicDetail): void {
    this.askReason({
      title: `Suspender ${c.name}`,
      message: 'Nadie de la clínica podrá entrar y se detendrán sus mensajes de WhatsApp. No se borra ningún dato y puedes reactivarla cuando quieras.',
      confirmLabel: 'Suspender',
      destructive: true,
    }, (reason) => this.platform.setClinicStatus(c.id, 'SUSPENDED', reason));
  }

  protected async reactivate(c: PlatformClinicDetail): Promise<void> {
    await this.platform.setClinicStatus(c.id, 'ACTIVE', '');
    await this.load();
  }

  protected revoke(grantId: string): void {
    this.askReason({
      title: 'Revocar concesión',
      message: 'Si no tiene otro Premium vigente, la clínica vuelve a Gratis desde ahora y conserva todos sus datos.',
      confirmLabel: 'Revocar',
      destructive: true,
    }, (reason) => this.platform.revokeGrant(grantId, reason));
  }

  private askReason(data: ReasonDialogData, act: (reason: string) => Promise<void>): void {
    this.dialog
      .open(ReasonDialogComponent, { data, width: '440px', maxWidth: '94vw' })
      .afterClosed()
      .subscribe(async (reason?: string) => {
        if (!reason) return;
        await act(reason);
        await this.load();
      });
  }

  private async load(): Promise<void> {
    this.clinic.set(await this.platform.clinic(this.route.snapshot.paramMap.get('id') ?? ''));
  }
}
