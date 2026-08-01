import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ThemeService } from './shell/theme.service';
import { PatientBannerComponent } from './patient-drive/patient-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslocoModule,
    PatientBannerComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <span>{{ 'shell.title' | transloco }}</span>
      <span class="spacer"></span>
      <button mat-icon-button [matMenuTriggerFor]="langMenu" aria-label="Language">
        <mat-icon>translate</mat-icon>
      </button>
      <mat-menu #langMenu="matMenu">
        <button mat-menu-item (click)="setLang('es')">Español</button>
        <button mat-menu-item (click)="setLang('en')">English</button>
      </mat-menu>
      <button mat-icon-button (click)="theme.toggle()" [attr.aria-label]="'shell.toggleTheme' | transloco">
        <mat-icon>{{ theme.mode() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
      </button>
    </mat-toolbar>
    <app-patient-banner></app-patient-banner>
    <router-outlet></router-outlet>
  `,
  styles: [
    `
      .spacer {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);

  protected setLang(lang: 'es' | 'en'): void {
    this.transloco.setActiveLang(lang);
  }
}
