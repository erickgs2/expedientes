import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService } from './auth/auth.service';
import { HasPermissionDirective } from './auth/has-permission.directive';
import { ThemeService } from './shell/theme.service';
import { PatientBannerComponent } from './patient-drive/patient-banner.component';

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
    </mat-menu>
    <mat-toolbar class="app-toolbar">
      <a routerLink="/patients" class="brand">
        <!-- The registration mark: a ringed cross, the dot a practitioner places on a face map. -->
        <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" />
          <circle cx="12" cy="12" r="2" class="dot" />
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
        <button mat-icon-button (click)="logout()" [attr.aria-label]="'shell.logout' | transloco">
          <mat-icon>logout</mat-icon>
        </button>
      }
    </mat-toolbar>
    <app-patient-banner></app-patient-banner>
    <main class="page-content">
      <router-outlet></router-outlet>
    </main>
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
        stroke: var(--mat-sys-on-surface);
        stroke-width: 1.25;
        stroke-linecap: round;
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

  protected adminActive(): boolean {
    return this.router.url.startsWith('/admin');
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
