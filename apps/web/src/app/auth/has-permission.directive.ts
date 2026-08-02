import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  // A signal, not a plain field: the effect below must re-run when the bound key changes, which a
  // plain field would not trigger. Correct for a dynamic expression, not just a string literal.
  private readonly permissionKey = signal('');
  private rendered = false;

  @Input() set appHasPermission(key: string) {
    this.permissionKey.set(key);
  }

  constructor() {
    effect(() => {
      const [module, action] = this.permissionKey().split(':');
      const allowed = !!module && !!action && this.auth.hasPermission(module, action);

      if (allowed && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
