import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { PlatformPriceVersion } from '@expedientes/shared-types';
import { PlatformService } from './platform.service';
import { dateTime, mxn } from './format';

/** Card fee in Mexico (3.6% + 3 MXN), plus IVA on the fee, to preview what reaches the account. */
function netAfterCard(cents: number): number {
  const fee = cents * 0.036 + 300;
  return Math.round(cents - fee * 1.16);
}

/**
 * The Premium price: the version in force, an editor with a live preview (annual price, the saving
 * clinics will see, the net after card fees) and the history of every version. A change applies to
 * new purchases; past charges keep their price.
 */
@Component({
  selector: 'app-platform-prices',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1 class="title">Precios</h1>

    <section class="editor plate">
      <h2>Nuevo precio de Premium</h2>
      <p class="hint">Aplica a compras nuevas desde que lo guardas. Los precios incluyen IVA.</p>
      <div class="fields">
        <mat-form-field appearance="outline">
          <mat-label>Mensualidad (MXN)</mat-label>
          <input matInput type="number" min="10" step="1" [ngModel]="monthly()" (ngModelChange)="monthly.set(+$event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Descuento anual (%)</mat-label>
          <input matInput type="number" min="0" max="50" step="1" [ngModel]="discount()" (ngModelChange)="discount.set(+$event)" />
        </mat-form-field>
      </div>
      <dl class="preview">
        <div><dt>Anual</dt><dd>{{ money(annualCents()) }}</dd></div>
        <div><dt>Las clínicas verán</dt><dd>Ahorra {{ discount() || 0 }}%</dd></div>
        <div><dt>Neto mensual con tarjeta</dt><dd>{{ money(netMonthly()) }}</dd></div>
        <div><dt>Neto anual con tarjeta</dt><dd>{{ money(netAnnual()) }}</dd></div>
      </dl>
      @if (problem()) {
        <p class="error" role="alert">{{ problem() }}</p>
      }
      @if (confirming()) {
        <div class="confirm">
          <p>
            ¿Cambiar el precio a {{ money(monthlyCents()) }} al mes y {{ money(annualCents()) }} al año? Las
            suscripciones activas conservan su precio.
          </p>
          <button mat-button (click)="confirming.set(false)">Cancelar</button>
          <button mat-flat-button [disabled]="busy()" (click)="save()">Guardar precio</button>
        </div>
      } @else {
        <button mat-flat-button [disabled]="!!problem() || unchanged()" (click)="confirming.set(true)">Revisar y guardar</button>
      }
    </section>

    <h2 class="section">Historial</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Desde</th><th class="num">Mensual</th><th class="num">Descuento</th><th class="num">Anual</th><th>Por</th><th></th></tr></thead>
        <tbody>
          @for (v of versions(); track v.id) {
            <tr>
              <td class="num">{{ stamp(v.effectiveFrom) }}</td>
              <td class="num">{{ money(v.monthlyCents) }}</td>
              <td class="num">{{ v.annualDiscountPercent }}%</td>
              <td class="num">{{ money(v.annualCents) }}</td>
              <td>{{ v.createdBy }}</td>
              <td>@if (v.current) { <span class="current">Vigente</span> }</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 880px;
      }
      .title {
        font-size: 1.875rem;
        font-weight: 700;
        letter-spacing: -0.015em;
        margin: 0 0 20px;
      }
      .plate {
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
        padding: 20px;
      }
      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }
      .section {
        margin: 32px 0 12px;
      }
      .hint {
        margin: 4px 0 16px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .fields {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
      .preview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px 24px;
        margin: 4px 0 16px;
        padding: 16px 0;
        border-top: 1px solid var(--plate-line);
        border-bottom: 1px solid var(--plate-line);
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
      .error {
        color: var(--mat-sys-error);
        margin: 0 0 12px;
      }
      .confirm {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .confirm p {
        flex-basis: 100%;
        margin: 0 0 4px;
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
      td.num:not(:first-child) {
        text-align: right;
      }
      .current {
        color: var(--plate-mark);
        font-weight: 600;
      }
    `,
  ],
})
export class PlatformPricesComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly versions = signal<PlatformPriceVersion[]>([]);
  protected readonly monthly = signal(150);
  protected readonly discount = signal(15);
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly money = mxn;
  protected readonly stamp = dateTime;

  protected readonly monthlyCents = computed(() => Math.round((this.monthly() || 0) * 100));
  protected readonly annualCents = computed(
    () => Math.round((this.monthlyCents() * 12 * (100 - (this.discount() || 0))) / 100 / 100) * 100
  );
  protected readonly netMonthly = computed(() => netAfterCard(this.monthlyCents()));
  protected readonly netAnnual = computed(() => netAfterCard(this.annualCents()));

  protected readonly problem = computed(() => {
    if (this.monthlyCents() < 1000) return 'La mensualidad debe ser de al menos 10 MXN.';
    if (!Number.isInteger(this.discount()) || this.discount() < 0 || this.discount() > 50) {
      return 'El descuento anual va de 0% a 50%, en enteros.';
    }
    if (this.annualCents() > 1_000_000) return 'El anual no puede pasar de 10,000 MXN, el máximo de un pago en OXXO.';
    return null;
  });

  protected readonly unchanged = computed(() => {
    const current = this.versions().find((v) => v.current);
    return !!current && current.monthlyCents === this.monthlyCents() && current.annualDiscountPercent === this.discount();
  });

  async ngOnInit(): Promise<void> {
    this.versions.set(await this.platform.prices());
    const current = this.versions().find((v) => v.current);
    if (current) {
      this.monthly.set(current.monthlyCents / 100);
      this.discount.set(current.annualDiscountPercent);
    }
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      this.versions.set(
        await this.platform.createPrice({ monthlyCents: this.monthlyCents(), annualDiscountPercent: this.discount() })
      );
      this.confirming.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
