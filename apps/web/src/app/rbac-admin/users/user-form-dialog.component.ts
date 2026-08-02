import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import { AdminRole, AdminUser, UsersService } from './users.service';

export interface UserFormDialogData {
  user: AdminUser | null;
  roles: AdminRole[];
}

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.user ? 'rbacAdmin.users.form.editTitle' : 'rbacAdmin.users.form.newTitle') | transloco }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'rbacAdmin.users.form.fullName' | transloco }}</mat-label>
          <input matInput formControlName="fullName" />
        </mat-form-field>
        @if (!data.user) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'rbacAdmin.users.form.email' | transloco }}</mat-label>
            <input matInput type="email" formControlName="email" />
          </mat-form-field>
        }
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>
            {{ (data.user ? 'rbacAdmin.users.form.newPassword' : 'rbacAdmin.users.form.password') | transloco }}
          </mat-label>
          <input matInput type="password" formControlName="password" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'rbacAdmin.users.form.role' | transloco }}</mat-label>
          <mat-select formControlName="roleId">
            @for (role of data.roles; track role.id) {
              <mat-option [value]="role.id">{{ role.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'rbacAdmin.users.form.language' | transloco }}</mat-label>
          <mat-select formControlName="language">
            <mat-option value="es">Español</mat-option>
            <mat-option value="en">English</mat-option>
          </mat-select>
        </mat-form-field>
        @if (data.user) {
          <mat-checkbox formControlName="active">
            {{ 'rbacAdmin.users.form.active' | transloco }}
          </mat-checkbox>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; display: block; }`],
})
export class UserFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent>);
  private readonly usersService = inject(UsersService);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);

  // NOTE: `data` is deliberately injected as a class field (not a constructor parameter
  // property) and declared before `form`. If `data` were a constructor parameter property
  // declared after `form` in the class body (as in the original task brief), TypeScript's
  // field-initialization order would run `form`'s initializer (which reads `this.data`)
  // before the parameter property assignment, producing a production-build-only error:
  // "TS2729: Property 'data' is used before its initialization." Dev-mode (JIT/hmr) does not
  // surface this; `npx nx build web` does.
  protected readonly data = inject<UserFormDialogData>(MAT_DIALOG_DATA);

  protected readonly form = this.fb.group({
    fullName: [this.data.user?.fullName ?? '', Validators.required],
    email: [this.data.user?.email ?? '', this.data.user ? [] : [Validators.required, Validators.email]],
    password: ['', this.data.user ? [] : [Validators.required]],
    roleId: [this.data.user?.roleId ?? this.data.roles[0]?.id ?? '', Validators.required],
    language: [this.data.user?.language ?? 'es', Validators.required],
    active: [this.data.user?.active ?? true],
  });

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    const value = this.form.value;
    try {
      if (this.data.user) {
        await this.usersService.updateUser(this.data.user.id, {
          fullName: value.fullName ?? undefined,
          roleId: value.roleId ?? undefined,
          language: value.language ?? undefined,
          active: value.active ?? undefined,
          newPassword: value.password || undefined,
        });
      } else {
        await this.usersService.createUser({
          email: value.email ?? '',
          password: value.password ?? '',
          fullName: value.fullName ?? '',
          roleId: value.roleId ?? '',
          language: value.language ?? 'es',
        });
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
