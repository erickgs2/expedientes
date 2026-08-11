import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AdminPermission, AdminRoleDetail, RolesService } from './roles.service';

export interface RoleFormDialogData {
  role: AdminRoleDetail | null;
  permissions: AdminPermission[];
}

@Component({
  selector: 'app-role-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.role ? 'rbacAdmin.roles.form.editTitle' : 'rbacAdmin.roles.form.newTitle') | transloco }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'rbacAdmin.roles.form.name' | transloco }}</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
      </form>
      <!-- Modules and actions are shown with translated labels, with the canonical identifier
           (patients:view, and so on) kept alongside the module name so an admin can still tell
           exactly which permission a checkbox grants. -->
      <div class="matrix">
        @for (module of modules; track module) {
          <section class="module-card">
            <header class="module-header">
              <span class="module-title">
                <span class="module-name">{{ moduleLabel(module) }}</span>
                <span class="module-id">{{ module }}</span>
              </span>
              <span class="module-count" [class.none]="selectedCount(module) === 0">
                {{ selectedCount(module) }}/{{ permissionsByModule(module).length }}
              </span>
            </header>
            <div class="module-actions">
              @for (permission of permissionsByModule(module); track permission.id) {
                <mat-checkbox
                  [checked]="selected.has(permission.id)"
                  (change)="toggle(permission.id)"
                >
                  {{ actionLabel(permission.action) }}
                </mat-checkbox>
              }
            </div>
          </section>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      /* One card per module instead of a single wrapping row of checkboxes: the actions stay
         grouped under their module on a phone, and the counter shows at a glance which modules
         the role actually grants. */
      .matrix {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .module-card {
        border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
        border-radius: 12px;
        padding: 12px 14px;
      }
      .module-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 4px;
      }
      .module-title {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .module-name {
        font-weight: 600;
      }
      /* The canonical identifier stays visible under the translated name so an admin can still
         map a checkbox to the exact permission it grants. */
      .module-id {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
      }
      .module-count {
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--mat-sys-primary-container, #ffd9dd);
        color: var(--mat-sys-on-primary-container, inherit);
      }
      .module-count.none {
        background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
        color: var(--mat-sys-on-surface-variant);
      }
      .module-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
        gap: 4px 12px;
      }
    `,
  ],
})
export class RoleFormDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<RoleFormDialogComponent>);
  private readonly rolesService = inject(RolesService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
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

  /**
   * Display label for a permission module/action. Falls back to the canonical identifier when a
   * translation is missing, so a permission added to the seed without a matching i18n key shows
   * as `newmodule` rather than as a raw `rbacAdmin.permissionModules.newmodule` key path.
   */
  protected moduleLabel(module: string): string {
    return this.translateOrRaw('rbacAdmin.permissionModules', module);
  }

  protected actionLabel(action: string): string {
    return this.translateOrRaw('rbacAdmin.permissionActions', action);
  }

  private translateOrRaw(prefix: string, value: string): string {
    const key = `${prefix}.${value}`;
    const translated = this.transloco.translate(key);
    return translated === key ? value : translated;
  }

  /** How many of this module's actions the role currently grants, for the header counter. */
  protected selectedCount(module: string): number {
    return this.permissionsByModule(module).filter((p) => this.selected.has(p.id)).length;
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
