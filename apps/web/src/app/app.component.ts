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
    <mat-toolbar color="primary" class="app-toolbar">
      <a routerLink="/patients" class="brand">
        <mat-icon aria-hidden="true">spa</mat-icon>
        <span>{{ 'shell.title' | transloco }}</span>
      </a>
      @if (auth.currentUser()) {
        <nav class="desktop-nav">
          <a mat-button routerLink="/patients" routerLinkActive="active-link">
            {{ 'shell.nav.patients' | transloco }}
          </a>
          <a
            *appHasPermission="'rbac-admin:view'"
            mat-button
            routerLink="/admin/users"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.users' | transloco }}
          </a>
          <a
            *appHasPermission="'rbac-admin:view'"
            mat-button
            routerLink="/admin/roles"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.roles' | transloco }}
          </a>
          <a
            *appHasPermission="'treatments:view'"
            mat-button
            routerLink="/admin/treatments"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.treatments' | transloco }}
          </a>
          <a
            *appHasPermission="'clinic-settings:view'"
            mat-button
            routerLink="/admin/clinic"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.clinicSettings' | transloco }}
          </a>
          <a
            *appHasPermission="'appointments:view'"
            mat-button
            routerLink="/calendar"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.calendar' | transloco }}
          </a>
          <a
            *appHasPermission="'export:view'"
            mat-button
            routerLink="/export"
            routerLinkActive="active-link"
          >
            {{ 'shell.nav.export' | transloco }}
          </a>
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
          <a mat-menu-item routerLink="/patients">
            <mat-icon>group</mat-icon>{{ 'shell.nav.patients' | transloco }}
          </a>
          <a *appHasPermission="'rbac-admin:view'" mat-menu-item routerLink="/admin/users">
            <mat-icon>manage_accounts</mat-icon>{{ 'shell.nav.users' | transloco }}
          </a>
          <a *appHasPermission="'rbac-admin:view'" mat-menu-item routerLink="/admin/roles">
            <mat-icon>admin_panel_settings</mat-icon>{{ 'shell.nav.roles' | transloco }}
          </a>
          <a *appHasPermission="'treatments:view'" mat-menu-item routerLink="/admin/treatments">
            <mat-icon>medical_services</mat-icon>{{ 'shell.nav.treatments' | transloco }}
          </a>
          <a *appHasPermission="'clinic-settings:view'" mat-menu-item routerLink="/admin/clinic">
            <mat-icon>business</mat-icon>{{ 'shell.nav.clinicSettings' | transloco }}
          </a>
          <a *appHasPermission="'appointments:view'" mat-menu-item routerLink="/calendar">
            <mat-icon>calendar_month</mat-icon>{{ 'shell.nav.calendar' | transloco }}
          </a>
          <a *appHasPermission="'export:view'" mat-menu-item routerLink="/export">
            <mat-icon>download</mat-icon>{{ 'shell.nav.export' | transloco }}
          </a>
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
        padding-top: env(safe-area-inset-top);
        padding-left: max(16px, env(safe-area-inset-left));
        padding-right: max(16px, env(safe-area-inset-right));
        height: calc(var(--mat-toolbar-standard-height, 64px) + env(safe-area-inset-top));
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        color: inherit;
        text-decoration: none;
        font-family: Figtree, Roboto, sans-serif;
        font-weight: 600;
        white-space: nowrap;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .desktop-nav {
        margin-left: 24px;
        display: flex;
        align-items: center;
      }
      .desktop-nav a {
        opacity: 0.85;
      }
      .desktop-nav a.active-link {
        opacity: 1;
        font-weight: 600;
        box-shadow: inset 0 -3px 0 currentColor;
        border-radius: 0;
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
        max-width: 1080px;
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

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
