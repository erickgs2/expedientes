import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@jsverse/transloco';
import { AdminRole, UsersService } from './users.service';

/**
 * Invites someone by email with a role. They receive a link, set their own name and password (or
 * use their existing account) and accept the privacy notice and terms; until then they are a
 * pending invitation, not a user.
 */
@Component({
  selector: 'app-invite-user-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'rbacAdmin.invitations.title' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="send()">
      <mat-dialog-content>
        <p class="hint">{{ 'rbacAdmin.invitations.hint' | transloco }}</p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ 'rbacAdmin.users.form.email' | transloco }}</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ 'rbacAdmin.users.form.role' | transloco }}</mat-label>
          <mat-select formControlName="roleId">
            @for (role of data.roles; track role.id) {
              <mat-option [value]="role.id">{{ role.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || sending()">
          {{ 'rbacAdmin.invitations.send' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .full {
        width: 100%;
      }
      .hint {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class InviteUserDialogComponent {
  protected readonly data = inject<{ roles: AdminRole[] }>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<InviteUserDialogComponent>);
  private readonly usersService = inject(UsersService);
  private readonly fb = inject(FormBuilder);
  protected readonly sending = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    roleId: [this.data.roles[0]?.id ?? '', Validators.required],
  });

  protected async send(): Promise<void> {
    if (this.form.invalid) return;
    this.sending.set(true);
    try {
      await this.usersService.invite(this.form.getRawValue());
      this.dialogRef.close(true);
    } finally {
      this.sending.set(false);
    }
  }
}
