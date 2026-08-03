import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
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
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslocoModule,
    HasPermissionDirective,
    PatientBannerComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <span>{{ 'shell.title' | transloco }}</span>
      @if (auth.currentUser()) {
        <nav>
          <a mat-button routerLink="/patients">{{ 'shell.nav.patients' | transloco }}</a>
          <a *appHasPermission="'rbac-admin:view'" mat-button routerLink="/admin/users">
            {{ 'shell.nav.users' | transloco }}
          </a>
          <a *appHasPermission="'rbac-admin:view'" mat-button routerLink="/admin/roles">
            {{ 'shell.nav.roles' | transloco }}
          </a>
          <a *appHasPermission="'treatments:view'" mat-button routerLink="/admin/treatments">
            {{ 'shell.nav.treatments' | transloco }}
          </a>
        </nav>
      }
      <span class="spacer"></span>
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
    <router-outlet></router-outlet>
  `,
  styles: [
    `
      .spacer {
        flex: 1 1 auto;
      }
      nav {
        margin-left: 24px;
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
