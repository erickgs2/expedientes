import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { TodayDesk } from '@expedientes/shared-types';

/** The right-hand column: clinic follow-ups, then the records this user opened last. */
@Component({
  selector: 'app-desk-side',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  template: `
    <section class="plate" [attr.aria-label]="'today.desk.side.pending' | transloco">
      <h2>{{ 'today.desk.side.pending' | transloco }}</h2>
      <a class="row" routerLink="/calendar">
        <span>{{ 'today.desk.side.tomorrowUnconfirmed' | transloco }}</span>
        <strong>{{ desk().kpis.tomorrowUnconfirmed }}</strong>
      </a>
      @if (desk().pending.afterPhotosMissing !== null) {
        <div class="row">
          <span>{{ 'today.desk.side.afterPhotos' | transloco }}</span>
          <strong>{{ desk().pending.afterPhotosMissing }}</strong>
        </div>
      }
      <a class="row" routerLink="/calendar">
        <span>{{ 'today.desk.side.noShows' | transloco }}</span>
        <strong>{{ desk().pending.noShowsThisWeek }}</strong>
      </a>
      @if (!desk().whatsappEnabled) {
        <p class="note">{{ 'today.desk.side.whatsappOff' | transloco }}</p>
      }
    </section>

    @if (desk().recentPatients; as recent) {
      <section class="plate" [attr.aria-label]="'today.desk.side.recent' | transloco">
        <h2>{{ 'today.desk.side.recent' | transloco }}</h2>
        @for (p of recent; track p.patientId) {
          <a class="row recent" [routerLink]="['/pacientes', p.patientId]">
            <span class="name">{{ p.patientName }}</span>
            <span class="meta">{{ when(p.viewedAt) }}</span>
          </a>
        } @empty {
          <p class="note">{{ 'today.desk.side.recentEmpty' | transloco }}</p>
        }
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .plate {
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
      }
      h2 {
        margin: 0;
        padding: 16px 20px 8px;
        font-size: 1rem;
        font-weight: 600;
      }
      .row {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 8px 20px;
        border-top: 1px solid var(--plate-line);
        color: inherit;
        text-decoration: none;
      }
      a.row:hover,
      a.row:focus-visible {
        background: var(--mat-sys-surface-container-low);
      }
      .row span {
        flex: 1;
      }
      .row strong {
        font-variant-numeric: tabular-nums;
      }
      .recent {
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 0;
      }
      .name {
        font-weight: 600;
      }
      .meta,
      .note {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .note {
        margin: 0;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--plate-line);
      }
    `,
  ],
})
export class DeskSideComponent {
  private readonly transloco = inject(TranslocoService);
  readonly desk = input.required<TodayDesk>();

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(this.transloco.getActiveLang(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
