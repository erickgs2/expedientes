import { Component, OnInit, inject, signal } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../auth/has-permission.directive';
import { AdminPermission, AdminRoleDetail, RolesService } from './roles.service';
import { RoleFormDialogComponent } from './role-form-dialog.component';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="header">
      <h1>{{ 'rbacAdmin.roles.title' | transloco }}</h1>
      <button
        *appHasPermission="'rbac-admin:create'"
        mat-flat-button
        color="primary"
        (click)="openCreate()"
      >
        <mat-icon>add</mat-icon> {{ 'rbacAdmin.roles.new' | transloco }}
      </button>
    </div>
    <mat-list>
      @for (role of roles(); track role.id) {
        <mat-list-item>
          <span matListItemTitle>{{ role.name }}</span>
          <button
            *appHasPermission="'rbac-admin:edit'"
            mat-icon-button
            (click)="openEdit(role)"
            [attr.aria-label]="'common.edit' | transloco"
          >
            <mat-icon>edit</mat-icon>
          </button>
        </mat-list-item>
      }
    </mat-list>
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
      }
    `,
  ],
})
export class RoleListComponent implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly dialog = inject(MatDialog);

  protected readonly roles = signal<AdminRoleDetail[]>([]);
  protected permissions: AdminPermission[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.permissions = await this.rolesService.listPermissions();
    this.roles.set(await this.rolesService.listRoles());
  }

  openCreate(): void {
    const ref = this.dialog.open(RoleFormDialogComponent, { data: { role: null, permissions: this.permissions } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  openEdit(role: AdminRoleDetail): void {
    const ref = this.dialog.open(RoleFormDialogComponent, { data: { role, permissions: this.permissions } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }
}
