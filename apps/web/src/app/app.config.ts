import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { provideAppTransloco } from './shell/transloco-root.module';
import { authInterceptor } from './auth/auth.interceptor';
import { errorInterceptor } from './auth/error.interceptor';

/**
 * A tab opened before a deploy still runs the old bundle, which lazy-loads chunk files the deploy
 * removed: the import fails and the screen never opens. The fix is loading the new index.html, so
 * the page reloads into the URL it was going to, once; a second failure within a minute is a real
 * problem and is left to surface instead of looping.
 */
function reloadOnStaleChunk(error: { error: unknown; url: string }): void {
  const message = String((error.error as Error | undefined)?.message ?? error.error ?? '');
  const stale = /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message);
  if (!stale) return;
  const key = 'medcloud:stale-chunk-reload';
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    window.location.assign(error.url);
  } catch {
    // No session storage means no way to tell a first failure from a loop: leave the error visible.
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withNavigationErrorHandler(reloadOnStaleChunk)),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAppTransloco(),
  ],
};
