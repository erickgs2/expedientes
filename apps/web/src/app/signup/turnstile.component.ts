import { Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/** Cloudflare Turnstile widget; emits a token when the check passes and null when it expires. */
@Component({
  selector: 'app-turnstile',
  standalone: true,
  template: `<div #host class="host"></div>`,
  styles: [
    `
      .host {
        min-height: 65px;
        margin: 4px 0 12px;
      }
    `,
  ],
})
export class TurnstileComponent implements OnDestroy {
  readonly siteKey = input.required<string>();
  readonly token = output<string | null>();
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private widgetId: string | null = null;

  constructor() {
    effect(() => {
      const siteKey = this.siteKey();
      const element = this.host().nativeElement;
      void loadScript().then(() => {
        if (!window.turnstile || this.widgetId) return;
        this.widgetId = window.turnstile.render(element, {
          sitekey: siteKey,
          language: 'es',
          callback: (token: string) => this.token.emit(token),
          'expired-callback': () => this.token.emit(null),
          'error-callback': () => this.token.emit(null),
        });
      });
    });
  }

  /** A token is single-use: after a rejected submit the widget must issue a new one. */
  reset(): void {
    if (this.widgetId && window.turnstile) window.turnstile.reset(this.widgetId);
    this.token.emit(null);
  }

  ngOnDestroy(): void {
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
  }
}
