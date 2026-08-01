import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  getTranslation(lang: string): Promise<Translation> {
    return fetch(`/assets/i18n/${lang}.json`).then((res) => res.json());
  }
}
