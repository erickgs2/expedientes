import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';

/**
 * Any address the app does not know. Drawn as a blank face-map plate whose rose mark landed off the
 * face: the page is the chart, the missing page is a mark with nowhere to go. Offers the way back
 * that fits who is looking: the day's work for a signed-in user, the sign-in otherwise, the portal
 * for an address under /plataforma.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <section class="not-found" aria-labelledby="not-found-title">
      <svg class="plate" viewBox="0 0 240 300" role="img" [attr.aria-label]="'notFound.illustration' | transloco">
        <rect class="sheet" x="0.5" y="0.5" width="239" height="299" rx="10" />
        <!-- Registration crosses, as on a printed chart. -->
        @for (corner of corners; track $index) {
          <path class="reg" [attr.d]="'M' + (corner[0] - 6) + ' ' + corner[1] + 'h12M' + corner[0] + ' ' + (corner[1] - 6) + 'v12'" />
        }
        <!-- The face and its guide lines: midline and the three facial thirds. -->
        <ellipse class="face" cx="120" cy="148" rx="62" ry="84" />
        <path class="guide" d="M120 56v184M62 116h116M62 168h116" />
        <path class="feature" d="M92 112q10-6 20 0M128 112q10-6 20 0M120 128v26q-6 4-10 2M104 186q16 8 32 0" />
        <!-- Where a mark would go, empty… -->
        <circle class="target" cx="148" cy="150" r="5" />
        <path class="leader" d="M152 146 L196 62" />
        <!-- …and the mark itself, off the face. -->
        <circle class="mark" cx="200" cy="54" r="7" />
        <text class="plate-no" x="16" y="284">{{ 'notFound.plate' | transloco }} 404</text>
      </svg>

      <div class="copy">
        <h1 id="not-found-title">{{ 'notFound.title' | transloco }}</h1>
        <p class="lead">
          {{ 'notFound.lead' | transloco }}
          <code class="path">{{ path }}</code>
        </p>
        <p class="hint">{{ 'notFound.hint' | transloco }}</p>

        <div class="actions">
          @if (onPlatform) {
            <a mat-flat-button routerLink="/plataforma">{{ 'notFound.toPortal' | transloco }}</a>
          } @else if (signedIn()) {
            <a mat-flat-button routerLink="/">
              <mat-icon>today</mat-icon>{{ 'notFound.toToday' | transloco }}
            </a>
            <a mat-stroked-button routerLink="/pacientes">
              <mat-icon>group</mat-icon>{{ 'notFound.toPatients' | transloco }}
            </a>
          } @else if (checked()) {
            <a mat-flat-button routerLink="/login">{{ 'notFound.toLogin' | transloco }}</a>
          }
          @if (canGoBack) {
            <button mat-button type="button" (click)="back()">
              <mat-icon>arrow_back</mat-icon>{{ 'notFound.back' | transloco }}
            </button>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .not-found {
        display: grid;
        grid-template-columns: 200px minmax(0, 1fr);
        gap: 48px;
        align-items: center;
        max-width: 760px;
        margin: clamp(24px, 10vh, 96px) auto 48px;
      }
      .plate {
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .sheet {
        fill: var(--mat-sys-surface);
        stroke: var(--plate-line);
      }
      .reg {
        stroke: var(--plate-line-strong);
        stroke-width: 1;
      }
      .face {
        fill: var(--mat-sys-surface-container-low);
        stroke: var(--plate-line-strong);
        stroke-width: 1.25;
        stroke-dasharray: 4 4;
      }
      .guide {
        stroke: var(--plate-line);
        stroke-width: 1;
      }
      .feature {
        fill: none;
        stroke: color-mix(in srgb, var(--mat-sys-on-surface-variant) 70%, transparent);
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .target {
        fill: none;
        stroke: var(--plate-mark);
        stroke-width: 1.25;
        stroke-dasharray: 2 2;
      }
      .leader {
        stroke: var(--plate-mark);
        stroke-width: 1;
        stroke-dasharray: 2 3;
        opacity: 0.6;
      }
      .mark {
        fill: var(--plate-mark);
        transform-box: fill-box;
        transform-origin: center;
        animation: settle 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .plate-no {
        font: 500 11px/1 var(--mat-sys-body-small-font, inherit);
        font-variant-numeric: tabular-nums;
        fill: var(--mat-sys-on-surface-variant);
        letter-spacing: 0.02em;
      }
      @keyframes settle {
        from {
          transform: translate(-6px, 10px) scale(0.85);
        }
        to {
          transform: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .mark {
          animation: none;
        }
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.875rem;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: -0.015em;
        text-wrap: balance;
      }
      .lead {
        margin: 0 0 8px;
        max-width: 60ch;
        font-size: 1rem;
        line-height: 1.5;
      }
      .path {
        display: inline-block;
        max-width: 100%;
        padding: 1px 6px;
        border: 1px solid var(--plate-line);
        border-radius: 6px;
        background: var(--mat-sys-surface-container-low);
        font-size: 0.8125rem;
        overflow-wrap: anywhere;
      }
      .hint {
        margin: 0 0 24px;
        max-width: 60ch;
        color: var(--mat-sys-on-surface-variant);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .actions a,
      .actions button {
        min-height: 44px;
      }
      @media (max-width: 719px) {
        .not-found {
          grid-template-columns: 1fr;
          gap: 24px;
          margin-top: 24px;
          justify-items: start;
        }
        .plate {
          width: 148px;
        }
        h1 {
          font-size: 1.5rem;
        }
      }
    `,
  ],
})
export class NotFoundComponent {
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);

  protected readonly corners = [
    [16, 16],
    [224, 16],
    [224, 284],
  ];
  /** What was typed or followed, without the origin, as the visitor would recognise it. */
  protected readonly path = inject(Router).url;
  protected readonly onPlatform = this.path.startsWith('/plataforma');
  protected readonly canGoBack = history.length > 1;

  /** The session is read before offering "sign in", so a signed-in user never sees that flash. */
  protected readonly checked = signal(this.auth.currentUser() !== null);
  protected readonly signedIn = computed(() => this.auth.currentUser() !== null);

  constructor() {
    if (!this.checked() && !this.onPlatform) {
      void this.auth.restoreSession().finally(() => this.checked.set(true));
    }
  }

  protected back(): void {
    this.location.back();
  }
}
