import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import type { PlanLimitDetails } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';

/**
 * Shown when the API answers 402 PLAN_LIMIT: says what the plan does not include, in place of an
 * error toast, and leads to the Plan screen. A user who cannot see the plan is told to ask the
 * clinic's owner instead.
 */
@Component({
  selector: 'app-plan-upgrade-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title class="title">
      <mat-icon aria-hidden="true">workspace_premium</mat-icon>
      {{ 'plan.upgrade.title' | transloco }}
    </h2>
    <mat-dialog-content>
      <p class="reason">{{ 'plan.upgrade.reason.' + data.limit | transloco: { max: data.max } }}</p>
      <p class="hint">
        {{ (canSeePlan ? 'plan.upgrade.hint' : 'plan.upgrade.askOwner') | transloco }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'plan.upgrade.notNow' | transloco }}</button>
      @if (canSeePlan) {
        <button mat-flat-button (click)="openPlan()">{{ 'plan.upgrade.seePlan' | transloco }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .title mat-icon {
        color: var(--mat-sys-primary);
      }
      .reason {
        margin: 0 0 8px;
        font-weight: 500;
      }
      .hint {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PlanUpgradeDialogComponent {
  protected readonly data = inject<PlanLimitDetails>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PlanUpgradeDialogComponent>);
  private readonly router = inject(Router);
  protected readonly canSeePlan = inject(AuthService).hasPermission('clinic-settings', 'view');

  protected openPlan(): void {
    this.dialogRef.close();
    void this.router.navigate(['/admin/plan']);
  }
}
