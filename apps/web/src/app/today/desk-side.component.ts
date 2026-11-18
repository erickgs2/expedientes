import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { TodayDesk, UnsignedNote } from '@expedientes/shared-types';
import { NoteSignatureService } from '../shared/note-signature/note-signature.service';

/**
 * The right-hand column: the user's own notes still to sign (NOM-004-SSA3-2012 5.10), clinic
 * follow-ups, then the records this user opened last.
 */
@Component({
  selector: 'app-desk-side',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  template: `
    @if (unsigned().length > 0) {
      <section class="plate" [attr.aria-label]="'today.desk.side.toSign' | transloco">
        <h2><span class="dot" aria-hidden="true"></span>{{ 'today.desk.side.toSign' | transloco: { n: unsigned().length } }}</h2>
        @for (n of unsigned(); track n.kind + n.id) {
          <a class="row recent" [routerLink]="noteLink(n)">
            <span class="name">{{ n.patientName }}</span>
            <span class="meta">{{ ('today.desk.side.noteKinds.' + n.kind) | transloco }} · {{ when(n.createdAt) }}</span>
          </a>
        }
      </section>
    }

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
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 16px 20px 8px;
        font-size: 1rem;
        font-weight: 600;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
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
export class DeskSideComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);
  private readonly notes = inject(NoteSignatureService);
  readonly desk = input.required<TodayDesk>();
  protected readonly unsigned = signal<UnsignedNote[]>([]);

  ngOnInit(): void {
    this.notes
      .unsigned()
      .then((list) => this.unsigned.set(list))
      .catch(() => undefined);
  }

  protected noteLink(n: UnsignedNote): string[] {
    if (n.kind === 'valoracion') return ['/pacientes', n.patientId, 'valoracion', n.id];
    if (n.kind === 'treatment') return ['/pacientes', n.patientId, 'treatments', n.id];
    return ['/pacientes', n.patientId, 'historia-clinica'];
  }

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
