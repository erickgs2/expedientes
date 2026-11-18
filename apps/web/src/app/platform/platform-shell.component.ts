import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../shell/theme.service';
import { PlatformService } from './platform.service';

/**
 * The portal's frame: a side navigation and the signed-in operator. Nothing here is shared with a
 * clinic's screens; the portal shows counts and plans, never clinical content.
 */
@Component({
  selector: 'app-platform-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  template: `
    <div class="frame">
      <aside class="side">
        <div class="brand">
          <span class="name">MedCloud</span>
          <span class="tag">Plataforma</span>
        </div>
        <nav aria-label="Portal de plataforma">
          @for (item of nav; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="on"
              [routerLinkActiveOptions]="{ exact: item.exact }"
            >
              <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>{{ item.label }}
            </a>
          }
        </nav>
        <div class="who">
          <span class="email">{{ platform.admin()?.email }}</span>
          <div class="who-actions">
            <button mat-icon-button (click)="theme.toggle()" aria-label="Cambiar tema">
              <mat-icon>{{ theme.mode() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
            </button>
            <button mat-icon-button (click)="logout()" aria-label="Cerrar sesión">
              <mat-icon>logout</mat-icon>
            </button>
          </div>
        </div>
      </aside>
      <main class="main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .frame {
        display: grid;
        grid-template-columns: 220px 1fr;
        min-height: 100vh;
      }
      .side {
        background: var(--mat-sys-surface-container-low);
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 20px 12px;
        border-right: 1px solid var(--plate-line);
        position: sticky;
        top: 0;
        height: 100vh;
        box-sizing: border-box;
      }
      .brand {
        display: flex;
        flex-direction: column;
        padding: 0 8px;
      }
      .name {
        font-weight: 700;
        font-size: 17px;
      }
      .tag {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      nav a {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        color: var(--mat-sys-on-surface-variant);
        text-decoration: none;
        font-size: 14px;
      }
      nav a mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      nav a:hover {
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface);
      }
      nav a.on {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      /* The registration dot marks where you are, as in the clinic header. */
      nav a.on::after {
        content: '';
        position: absolute;
        right: 10px;
        top: 50%;
        width: 6px;
        height: 6px;
        margin-top: -3px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .who {
        padding: 8px;
        border-top: 1px solid var(--plate-line);
      }
      .email {
        display: block;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .who-actions {
        display: flex;
        gap: 4px;
        margin-top: 4px;
      }
      .main {
        padding: 24px 28px 48px;
        min-width: 0;
      }
      @media (max-width: 760px) {
        .frame {
          grid-template-columns: 1fr;
        }
        .side {
          position: static;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid var(--plate-line);
        }
        nav {
          flex-direction: row;
          flex-wrap: wrap;
        }
        .main {
          padding: 16px;
        }
      }
    `,
  ],
})
export class PlatformShellComponent {
  protected readonly platform = inject(PlatformService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly nav = [
    { path: '/plataforma', label: 'Panel', icon: 'monitoring', exact: true },
    { path: '/plataforma/clinicas', label: 'Clínicas', icon: 'local_hospital', exact: false },
    { path: '/plataforma/precios', label: 'Precios', icon: 'sell', exact: false },
    { path: '/plataforma/legales', label: 'Documentos legales', icon: 'gavel', exact: false },
    { path: '/plataforma/bitacora', label: 'Bitácora', icon: 'history', exact: false },
  ];

  protected async logout(): Promise<void> {
    await this.platform.logout();
    await this.router.navigate(['/plataforma/login']);
  }
}
