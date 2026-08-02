import { Component, OnInit, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../auth/has-permission.directive';
import { AdminRole, AdminUser, UsersService } from './users.service';
import { UserFormDialogComponent } from './user-form-dialog.component';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    TranslocoModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="header">
      <h1>{{ 'rbacAdmin.users.title' | transloco }}</h1>
      <button
        *appHasPermission="'rbac-admin:create'"
        mat-flat-button
        color="primary"
        (click)="openCreate()"
      >
        <mat-icon>add</mat-icon> {{ 'rbacAdmin.users.new' | transloco }}
      </button>
    </div>
    <table mat-table [dataSource]="users()" class="mat-elevation-z1">
      <ng-container matColumnDef="fullName">
        <th mat-header-cell *matHeaderCellDef>{{ 'rbacAdmin.users.name' | transloco }}</th>
        <td mat-cell *matCellDef="let u">{{ u.fullName }}</td>
      </ng-container>
      <ng-container matColumnDef="email">
        <th mat-header-cell *matHeaderCellDef>{{ 'rbacAdmin.users.email' | transloco }}</th>
        <td mat-cell *matCellDef="let u">{{ u.email }}</td>
      </ng-container>
      <ng-container matColumnDef="roleName">
        <th mat-header-cell *matHeaderCellDef>{{ 'rbacAdmin.users.role' | transloco }}</th>
        <td mat-cell *matCellDef="let u">{{ u.roleName }}</td>
      </ng-container>
      <ng-container matColumnDef="active">
        <th mat-header-cell *matHeaderCellDef>{{ 'rbacAdmin.users.active' | transloco }}</th>
        <td mat-cell *matCellDef="let u">
          {{ (u.active ? 'common.yes' : 'common.no') | transloco }}
        </td>
      </ng-container>
      <ng-container matColumnDef="edit">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let u">
          <button
            *appHasPermission="'rbac-admin:edit'"
            mat-icon-button
            (click)="openEdit(u)"
            [attr.aria-label]="'common.edit' | transloco"
          >
            <mat-icon>edit</mat-icon>
          </button>
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
      }
      table {
        width: 100%;
      }
    `,
  ],
})
export class UserListComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['fullName', 'email', 'roleName', 'active', 'edit'];
  protected readonly users = signal<AdminUser[]>([]);
  protected roles: AdminRole[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.roles = await this.usersService.listRoles();
    this.users.set(await this.usersService.listUsers());
  }

  openCreate(): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: { user: null, roles: this.roles } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }

  openEdit(user: AdminUser): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: { user, roles: this.roles } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }
}
