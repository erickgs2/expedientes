import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { AdminPermission, AdminRoleDetail, RolesService } from './roles.service';

export interface RoleFormDialogData {
  role: AdminRoleDetail | null;
  permissions: AdminPermission[];
}

@Component({
  selector: 'app-role-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.role ? 'Edit role' : 'New role' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
      </form>
      <div class="matrix">
        @for (module of modules; track module) {
          <div class="module-row">
            <strong>{{ module }}</strong>
            @for (permission of permissionsByModule(module); track permission.id) {
              <mat-checkbox
                [checked]="selected.has(permission.id)"
                (change)="toggle(permission.id)"
              >
                {{ permission.action }}
              </mat-checkbox>
            }
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .module-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 0;
      }
    `,
  ],
})
export class RoleFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<RoleFormDialogComponent>);
  private readonly rolesService = inject(RolesService);
  private readonly fb = inject(FormBuilder);
  protected readonly saving = signal(false);

  // `data` must be a field injected before any field initializer that reads it (`modules`,
  // `selected`, `form` below) — see UserFormDialogComponent for why a constructor parameter
  // property here would produce a production-build-only "used before its initialization" error.
  protected readonly data = inject<RoleFormDialogData>(MAT_DIALOG_DATA);

  protected readonly modules: string[] = [...new Set(this.data.permissions.map((p) => p.module))];

  protected readonly selected: Set<string> = (() => {
    const grantedKeys = new Set(this.data.role?.permissions ?? []);
    return new Set(
      this.data.permissions.filter((p) => grantedKeys.has(`${p.module}:${p.action}`)).map((p) => p.id)
    );
  })();

  protected readonly form = this.fb.group({
    name: [this.data.role?.name ?? '', Validators.required],
  });

  protected permissionsByModule(module: string): AdminPermission[] {
    return this.data.permissions.filter((p) => p.module === module);
  }

  protected toggle(permissionId: string): void {
    if (this.selected.has(permissionId)) {
      this.selected.delete(permissionId);
    } else {
      this.selected.add(permissionId);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const permissionIds = [...this.selected];
      if (this.data.role) {
        await this.rolesService.updateRole(this.data.role.id, {
          name: this.form.value.name ?? undefined,
          permissionIds,
        });
      } else {
        const created = await this.rolesService.createRole(this.form.value.name ?? '');
        await this.rolesService.updateRole(created.id, { permissionIds });
      }
      this.dialogRef.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}
