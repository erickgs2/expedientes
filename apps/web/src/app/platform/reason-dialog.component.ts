import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ReasonDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive actions use the warn color; Cancel keeps the focus. */
  destructive?: boolean;
}

/** Confirms a sensitive portal action and asks for the reason that goes to the audit log. */
@Component({
  selector: 'app-reason-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Motivo</mat-label>
        <input matInput [(ngModel)]="reason" maxlength="200" />
        <mat-hint>Queda en la bitácora.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close cdkFocusInitial>Cancelar</button>
      <button
        mat-flat-button
        [color]="data.destructive ? 'warn' : 'primary'"
        [disabled]="reason.trim().length < 3"
        [mat-dialog-close]="reason.trim()"
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full {
        width: 100%;
      }
    `,
  ],
})
export class ReasonDialogComponent {
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  protected reason = '';
}
