import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject, signal } from '@angular/core';
import type { PlanFeature } from '@expedientes/shared-types';
import { AuthService } from './auth.service';

/**
 * Renders its template only when the clinic's plan includes the feature, like `*appHasPermission`
 * does for permissions. `*appHasFeature="'customRoles'; else locked"` shows `locked` otherwise, so a
 * screen can explain the feature instead of hiding it.
 */
@Directive({
  selector: '[appHasFeature]',
  standalone: true,
})
export class HasFeatureDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  private readonly feature = signal<PlanFeature | null>(null);
  private readonly elseTemplate = signal<TemplateRef<unknown> | null>(null);

  @Input() set appHasFeature(feature: PlanFeature) {
    this.feature.set(feature);
  }

  @Input() set appHasFeatureElse(template: TemplateRef<unknown> | null) {
    this.elseTemplate.set(template);
  }

  constructor() {
    effect(() => {
      const feature = this.feature();
      const allowed = !!feature && this.auth.hasFeature(feature);
      const template = allowed ? this.templateRef : this.elseTemplate();
      this.viewContainer.clear();
      if (template) this.viewContainer.createEmbeddedView(template);
    });
  }
}
