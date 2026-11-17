import { Component, OnInit, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../auth/has-permission.directive';
import { AdminRole, AdminUser, UsersService } from './users.service';
import { UserFormDialogComponent } from './user-form-dialog.component';
import { InviteUserDialogComponent } from './invite-user-dialog.component';
import type { PendingInvitation } from '@expedientes/shared-types';

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
        (click)="openInvite()"
      >
        <mat-icon>person_add</mat-icon> {{ 'rbacAdmin.invitations.invite' | transloco }}
      </button>
    </div>
    <div class="table-scroll">
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
    </div>

    @if (invitations().length > 0) {
      <section class="pending">
        <h2>{{ 'rbacAdmin.invitations.pending' | transloco }}</h2>
        <ul>
          @for (inv of invitations(); track inv.id) {
            <li>
              <span class="who">
                <strong>{{ inv.email }}</strong>
                <span class="meta">
                  {{ inv.roleName }} · {{ 'rbacAdmin.invitations.expires' | transloco: { date: date(inv.expiresAt) } }}
                </span>
              </span>
              <button
                *appHasPermission="'rbac-admin:create'"
                mat-button
                type="button"
                (click)="revoke(inv)"
              >
                {{ 'rbacAdmin.invitations.revoke' | transloco }}
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [
    `
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 0 16px;
      }
      table {
        width: 100%;
      }
      .pending {
        margin-top: 24px;
      }
      .pending h2 {
        font-size: 16px;
        margin: 0 0 8px;
      }
      .pending ul {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
      }
      .pending li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
      }
      .pending li + li {
        border-top: 1px solid var(--plate-line);
      }
      .who {
        display: flex;
        flex-direction: column;
      }
      .meta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class UserListComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['fullName', 'email', 'roleName', 'active', 'edit'];
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly invitations = signal<PendingInvitation[]>([]);
  protected roles: AdminRole[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.roles = await this.usersService.listRoles();
    this.users.set(await this.usersService.listUsers());
    this.invitations.set(await this.usersService.listInvitations());
  }

  openInvite(): void {
    const ref = this.dialog.open(InviteUserDialogComponent, { data: { roles: this.roles }, maxWidth: 440 });
    ref.afterClosed().subscribe((sent) => {
      if (sent) this.refresh();
    });
  }

  async revoke(invitation: PendingInvitation): Promise<void> {
    await this.usersService.revokeInvitation(invitation.id);
    await this.refresh();
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }

  openEdit(user: AdminUser): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: { user, roles: this.roles } });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.refresh();
    });
  }
}
