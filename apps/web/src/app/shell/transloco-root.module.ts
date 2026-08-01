import { isDevMode } from '@angular/core';
import { TranslocoHttpLoader } from './transloco-http-loader';
import { provideTransloco } from '@jsverse/transloco';

export const provideAppTransloco = () =>
  provideTransloco({
    config: {
      availableLangs: ['es', 'en'],
      defaultLang: 'es',
      fallbackLang: 'es',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: TranslocoHttpLoader,
  });
