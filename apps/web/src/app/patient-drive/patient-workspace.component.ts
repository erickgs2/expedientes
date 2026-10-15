import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoModule } from '@jsverse/transloco';
import { HasPermissionDirective } from '../auth/has-permission.directive';

/**
 * The frame every patient screen sits in. The tab bar is the patient's own navigation — record,
 * valoraciones, treatments, photos, export — so moving between them no longer means going back to
 * a hub page first, and "Exportar" stops pretending to be a clinic-wide menu item.
 *
 * Routing and the loaded patient are owned by `patientRouteGuard`; this component only draws.
 * Links are relative to the `/pacientes/:patientId` route, so they follow the patient in the URL.
 */
@Component({
  selector: 'app-patient-workspace',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatTabsModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <nav
      mat-tab-nav-bar
      class="workspace-tabs"
      [tabPanel]="panel"
      [attr.aria-label]="'workspace.tabsLabel' | transloco"
    >
      <a
        *appHasPermission="'historia-clinica:view'"
        mat-tab-link
        routerLink="historia-clinica"
        routerLinkActive
        #hc="routerLinkActive"
        [active]="hc.isActive"
      >
        {{ 'workspace.tabs.record' | transloco }}
      </a>
      <a
        *appHasPermission="'valoracion:view'"
        mat-tab-link
        routerLink="valoracion"
        routerLinkActive
        #va="routerLinkActive"
        [active]="va.isActive"
      >
        {{ 'workspace.tabs.valoraciones' | transloco }}
      </a>
      <a
        *appHasPermission="'treatments:view'"
        mat-tab-link
        routerLink="treatments"
        routerLinkActive
        #tr="routerLinkActive"
        [active]="tr.isActive"
      >
        {{ 'workspace.tabs.treatments' | transloco }}
      </a>
      <a
        *appHasPermission="'valoracion:view'"
        mat-tab-link
        routerLink="photos"
        routerLinkActive
        #ph="routerLinkActive"
        [active]="ph.isActive"
      >
        {{ 'workspace.tabs.photos' | transloco }}
      </a>
      <a
        *appHasPermission="'export:view'"
        mat-tab-link
        routerLink="export"
        routerLinkActive
        #ex="routerLinkActive"
        [active]="ex.isActive"
      >
        {{ 'workspace.tabs.export' | transloco }}
      </a>
    </nav>
    <mat-tab-nav-panel #panel class="workspace-panel">
      <router-outlet></router-outlet>
    </mat-tab-nav-panel>
  `,
  styles: [
    `
      .workspace-tabs {
        margin-bottom: 24px;
        border-bottom: 1px solid var(--plate-line);
      }
      .workspace-panel {
        display: block;
      }
    `,
  ],
})
export class PatientWorkspaceComponent {}
