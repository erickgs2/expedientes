import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService } from './auth/auth.service';
import {
  PendingLegalDialogComponent,
  type PendingLegalResult,
} from './legal/pending-legal-dialog.component';
import { HasPermissionDirective } from './auth/has-permission.directive';
import { ThemeService } from './shell/theme.service';
import { PatientBannerComponent } from './patient-drive/patient-banner.component';
import { PlanCompareDialogComponent } from './plan/plan-compare-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslocoModule,
    HasPermissionDirective,
    PatientBannerComponent,
  ],
  template: `
    <mat-menu #adminMenu="matMenu">
      <a *appHasPermission="'rbac-admin:view'" mat-menu-item routerLink="/admin/users">
        <mat-icon>manage_accounts</mat-icon>{{ 'shell.nav.users' | transloco }}
      </a>
      <a *appHasPermission="'rbac-admin:view'" mat-menu-item routerLink="/admin/roles">
        <mat-icon>admin_panel_settings</mat-icon>{{ 'shell.nav.roles' | transloco }}
      </a>
      <a *appHasPermission="'treatments:view'" mat-menu-item routerLink="/admin/treatments">
        <mat-icon>medical_services</mat-icon>{{ 'shell.nav.treatmentCatalog' | transloco }}
      </a>
      <a *appHasPermission="'clinic-settings:view'" mat-menu-item routerLink="/admin/clinic">
        <mat-icon>business</mat-icon>{{ 'shell.nav.clinicSettings' | transloco }}
      </a>
      <a *appHasPermission="'clinic-settings:view'" mat-menu-item routerLink="/admin/plan">
        <mat-icon>workspace_premium</mat-icon>{{ 'shell.nav.plan' | transloco }}
      </a>
    </mat-menu>
    @if (!onPlatform()) {
    <mat-toolbar class="app-toolbar">
      <a routerLink="/pacientes" class="brand">
        <!-- The MedCloud mark: a lotus rising from a cloud, its rose dot the point a practitioner places on a face map. -->
        <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
            <path class="petal" d="M24 34C14 36 6 31 6 22C14 22 21 27 24 34Z" />
            <path class="petal" d="M24 34C34 36 42 31 42 22C34 22 27 27 24 34Z" />
            <path class="petal" d="M24 34C15 30 10 22 13 14C21 17 25 25 24 34Z" />
            <path class="petal" d="M24 34C33 30 38 22 35 14C27 17 23 25 24 34Z" />
            <path class="petal" d="M6 39c0 4 4 6 8 5.5 3-.4 4-1.5 10-1.5s7 1.1 10 1.5c4 .5 8-1.5 8-5.5" />
            <path class="accent" d="M24 34C17 28 17 16 24 9.5C31 16 31 28 24 34Z" />
            <circle class="dot" cx="24" cy="6.6" r="2.3" />
          </svg>
        <span>{{ 'shell.title' | transloco }}</span>
      </a>
      @if (auth.currentUser()) {
        <nav class="desktop-nav" [attr.aria-label]="'shell.menu' | transloco">
          <a
            mat-button
            routerLink="/"
            routerLinkActive="active-link"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            {{ 'shell.nav.today' | transloco }}
          </a>
          <a mat-button routerLink="/pacientes" routerLinkActive="active-link">
            {{ 'shell.nav.patients' | transloco }}
          </a>
          <a
            *appHasPermission="'appointments:view'"
            mat-button
            routerLink="/calendar"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.calendar' | transloco }}
          </a>
          @if (canAdminister()) {
            <button
              mat-button
              type="button"
              class="admin-trigger"
              [class.active-link]="adminActive()"
              [matMenuTriggerFor]="adminMenu"
            >
              {{ 'shell.nav.admin' | transloco }}
              <mat-icon iconPositionEnd>arrow_drop_down</mat-icon>
            </button>
          }
          @if (showPremium()) {
            <button mat-stroked-button type="button" class="premium-cta" (click)="openPlanCompare()">
              <mat-icon>workspace_premium</mat-icon>{{ 'shell.nav.premium' | transloco }}
            </button>
          }
        </nav>
      }
      <span class="spacer"></span>
      @if (auth.currentUser()) {
        <button
          mat-icon-button
          class="mobile-nav-trigger"
          [matMenuTriggerFor]="navMenu"
          [attr.aria-label]="'shell.menu' | transloco"
        >
          <mat-icon>menu</mat-icon>
        </button>
        <mat-menu #navMenu="matMenu">
          <a mat-menu-item routerLink="/">
            <mat-icon>today</mat-icon>{{ 'shell.nav.today' | transloco }}
          </a>
          <a mat-menu-item routerLink="/pacientes">
            <mat-icon>group</mat-icon>{{ 'shell.nav.patients' | transloco }}
          </a>
          <a *appHasPermission="'appointments:view'" mat-menu-item routerLink="/calendar">
            <mat-icon>calendar_month</mat-icon>{{ 'shell.nav.calendar' | transloco }}
          </a>
          @if (canAdminister()) {
            <a mat-menu-item [matMenuTriggerFor]="adminMenu">
              <mat-icon>settings</mat-icon>{{ 'shell.nav.admin' | transloco }}
            </a>
          }
          @if (showPremium()) {
            <button mat-menu-item type="button" (click)="openPlanCompare()">
              <mat-icon>workspace_premium</mat-icon>{{ 'shell.nav.premium' | transloco }}
            </button>
          }
        </mat-menu>

      }
      <button
        mat-icon-button
        [matMenuTriggerFor]="langMenu"
        [attr.aria-label]="'shell.language' | transloco"
      >
        <mat-icon>translate</mat-icon>
      </button>
      <mat-menu #langMenu="matMenu">
        <button mat-menu-item (click)="setLang('es')">Español</button>
        <button mat-menu-item (click)="setLang('en')">English</button>
      </mat-menu>
      <button mat-icon-button (click)="theme.toggle()" [attr.aria-label]="'shell.toggleTheme' | transloco">
        <mat-icon>{{ theme.mode() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
      </button>
      @if (auth.currentUser()) {
        <a mat-icon-button routerLink="/perfil" [attr.aria-label]="'shell.profile' | transloco" [attr.title]="'shell.profile' | transloco">
          <mat-icon>account_circle</mat-icon>
        </a>
        <button mat-icon-button (click)="logout()" [attr.aria-label]="'shell.logout' | transloco">
          <mat-icon>logout</mat-icon>
        </button>
      }
    </mat-toolbar>
    <app-patient-banner></app-patient-banner>
    <main class="page-content">
      <router-outlet></router-outlet>
    </main>
    } @else {
      <!-- The platform portal has its own frame (platform-shell) and no clinic chrome. -->
      <router-outlet></router-outlet>
    }
  `,
  styles: [
    `
      .app-toolbar {
        position: sticky;
        top: 0;
        z-index: 100;
        gap: 4px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
        border-bottom: 1px solid var(--plate-line);
        padding-top: env(safe-area-inset-top);
        padding-left: max(16px, env(safe-area-inset-left));
        padding-right: max(16px, env(safe-area-inset-right));
        height: calc(var(--mat-toolbar-standard-height, 64px) + env(safe-area-inset-top));
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        color: inherit;
        text-decoration: none;
        font-weight: 700;
        font-size: 1.125rem;
        letter-spacing: -0.02em;
        white-space: nowrap;
      }
      .brand-mark {
        width: 28px;
        height: 28px;
        fill: none;
        stroke: color-mix(in srgb, var(--mat-sys-secondary) 60%, var(--mat-sys-surface));
        stroke-width: 2.4;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .brand-mark .accent {
        stroke: color-mix(in srgb, var(--plate-mark) 55%, var(--mat-sys-surface));
        stroke-width: 2.6;
      }
      .brand-mark .dot {
        fill: var(--plate-mark);
        stroke: none;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .desktop-nav {
        margin-left: 28px;
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .desktop-nav a,
      .desktop-nav .admin-trigger {
        position: relative;
        color: var(--mat-sys-on-surface-variant);
        letter-spacing: 0;
      }
      .desktop-nav a:hover {
        color: var(--mat-sys-on-surface);
      }
      /* The active page carries the mark: a small rose dot under the label, like a point on the map. */
      .desktop-nav a.active-link {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .desktop-nav .admin-trigger {
        color: var(--mat-sys-on-surface-variant);
      }
      .desktop-nav .admin-trigger.active-link {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .desktop-nav a.active-link::after,
      .desktop-nav .admin-trigger.active-link::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 6px;
        width: 5px;
        height: 5px;
        margin-left: -2.5px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      /* Set apart from the page links: it opens the plan comparison, it is not a place. */
      .desktop-nav .premium-cta {
        margin-left: 12px;
        height: 36px;
        letter-spacing: 0;
      }
      .desktop-nav .premium-cta mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .mobile-nav-trigger {
        display: none;
      }
      @media (max-width: 959px) {
        .desktop-nav {
          display: none;
        }
        .mobile-nav-trigger {
          display: inline-flex;
        }
      }
      .page-content {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px;
        padding-left: calc(24px + env(safe-area-inset-left));
        padding-right: calc(24px + env(safe-area-inset-right));
        padding-bottom: calc(24px + env(safe-area-inset-bottom));
      }
      @media (max-width: 599px) {
        .app-toolbar {
          height: calc(var(--mat-toolbar-mobile-height, 56px) + env(safe-area-inset-top));
        }
        .page-content {
          padding: 16px;
          padding-left: calc(16px + env(safe-area-inset-left));
          padding-right: calc(16px + env(safe-area-inset-right));
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
        }
      }
    `,
  ],
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private legalDialogOpen = false;

  /** The platform portal (/plataforma) is a separate product for the operator, without clinic chrome. */
  protected readonly onPlatform = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.startsWith('/plataforma'))
    ),
    { initialValue: location.pathname.startsWith('/plataforma') }
  );

  constructor() {
    // A new privacy notice or terms version that requires acceptance blocks the app until the user
    // accepts it or signs out.
    effect(() => {
      const pending = this.auth.currentUser()?.pendingLegal ?? [];
      if (pending.length === 0 || this.legalDialogOpen) return;
      this.legalDialogOpen = true;
      this.dialog
        .open<PendingLegalDialogComponent, unknown, PendingLegalResult>(PendingLegalDialogComponent, {
          data: pending,
          disableClose: true,
          maxWidth: 520,
        })
        .afterClosed()
        .subscribe(async (result) => {
          this.legalDialogOpen = false;
          if (result === 'accepted') this.auth.setPendingLegal([]);
          else await this.logout();
        });
    });
  }

  protected setLang(lang: 'es' | 'en'): void {
    this.transloco.setActiveLang(lang);
  }

  protected canAdminister(): boolean {
    return (
      this.auth.hasPermission('rbac-admin', 'view') ||
      this.auth.hasPermission('treatments', 'view') ||
      this.auth.hasPermission('clinic-settings', 'view')
    );
  }

  /** The way to Premium in the header: for whoever manages the plan, while the clinic is on Free. */
  protected showPremium(): boolean {
    return this.auth.plan()?.tier === 'FREE' && this.auth.hasPermission('clinic-settings', 'view');
  }

  protected openPlanCompare(): void {
    this.dialog.open(PlanCompareDialogComponent, { width: '600px', maxWidth: 'calc(100vw - 32px)', autoFocus: false });
  }

  protected adminActive(): boolean {
    return this.router.url.startsWith('/admin');
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
