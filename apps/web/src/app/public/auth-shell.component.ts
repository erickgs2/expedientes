import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

/**
 * The frame of the screens a signed-out person sees (sign-up, password reset, invitation): the
 * MedCloud mark and name over one card, the same as the sign-in screen.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [MatCardModule],
  template: `
    <div class="shell" [style.--shell-width.px]="width()">
      <mat-card class="card">
        <mat-card-content>
          <div class="brand">
            <svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
              <path class="petal" d="M24 34C14 36 6 31 6 22C14 22 21 27 24 34Z" />
              <path class="petal" d="M24 34C34 36 42 31 42 22C34 22 27 27 24 34Z" />
              <path class="petal" d="M24 34C15 30 10 22 13 14C21 17 25 25 24 34Z" />
              <path class="petal" d="M24 34C33 30 38 22 35 14C27 17 23 25 24 34Z" />
              <path class="petal" d="M6 39c0 4 4 6 8 5.5 3-.4 4-1.5 10-1.5s7 1.1 10 1.5c4 .5 8-1.5 8-5.5" />
              <path class="accent" d="M24 34C17 28 17 16 24 9.5C31 16 31 28 24 34Z" />
              <circle class="dot" cx="24" cy="6.6" r="2.3" />
            </svg>
            <span class="name">MedCloud</span>
          </div>
          <ng-content />
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 8vh 16px 32px;
      }
      .card {
        width: 100%;
        max-width: var(--shell-width, 440px);
        padding: 12px 8px 8px;
      }
      .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin: 8px 0 20px;
      }
      .mark {
        width: 32px;
        height: 32px;
        fill: none;
        stroke: color-mix(in srgb, var(--mat-sys-secondary) 60%, var(--mat-sys-surface));
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .mark .accent {
        stroke: color-mix(in srgb, var(--plate-mark) 55%, var(--mat-sys-surface));
        stroke-width: 2.2;
      }
      .mark .dot {
        fill: var(--plate-mark);
        stroke: none;
      }
      .name {
        font-size: 18px;
        font-weight: 600;
      }
    `,
  ],
})
export class AuthShellComponent {
  /** Card width in pixels; wider for the step that shows legal text. */
  readonly width = input(440);
}
