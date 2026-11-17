import { Component, OnDestroy, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Entering a 6-digit emailed code, with a resend link that waits out its cooldown. Shared by sign-up
 * and password reset; the parent does the request and passes the error back in.
 */
@Component({
  selector: 'app-code-step',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslocoModule],
  template: `
    <p class="sent">{{ 'signup.code.sentTo' | transloco: { email: email() } }}</p>
    <mat-form-field appearance="outline" class="full">
      <mat-label>{{ 'signup.code.label' | transloco }}</mat-label>
      <input
        matInput
        class="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        [ngModel]="code()"
        (ngModelChange)="onInput($event)"
        name="code"
      />
    </mat-form-field>
    <ng-content />
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="resend">
      @if (secondsLeft() > 0) {
        <span>{{ 'signup.code.resendIn' | transloco: { seconds: secondsLeft() } }}</span>
      } @else {
        <button mat-button type="button" (click)="resend.emit()">{{ 'signup.code.resend' | transloco }}</button>
      }
      <button mat-button type="button" (click)="back.emit()">{{ 'signup.code.changeEmail' | transloco }}</button>
    </div>
  `,
  styles: [
    `
      .sent {
        margin: 0 0 16px;
      }
      .full {
        width: 100%;
      }
      .code {
        font-size: 24px;
        letter-spacing: 8px;
        font-variant-numeric: tabular-nums;
      }
      .error {
        color: var(--mat-sys-error, #b91c1c);
        margin: 0 0 12px;
      }
      .resend {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class CodeStepComponent implements OnDestroy {
  readonly email = input.required<string>();
  readonly error = input<string | null>(null);
  readonly codeChange = output<string>();
  readonly resend = output<void>();
  readonly back = output<void>();

  protected readonly code = signal('');
  protected readonly secondsLeft = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Starts the wait before another code may be requested. */
  startCooldown(seconds: number): void {
    this.secondsLeft.set(seconds);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const left = this.secondsLeft() - 1;
      this.secondsLeft.set(Math.max(0, left));
      if (left <= 0 && this.timer) clearInterval(this.timer);
    }, 1000);
  }

  protected onInput(value: string): void {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, 6);
    this.code.set(digits);
    this.codeChange.emit(digits);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
