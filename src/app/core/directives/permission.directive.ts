import {
  Directive,
  OnInit,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Shows the host only when the signed-in user holds the permission.
 * Pass one key, or a list to allow any of them.
 *
 * ```html
 * <button *ctrlPermission="'catalog.write'">إضافة</button>
 * ```
 */
@Directive({
  selector: '[ctrlPermission]',
  standalone: true,
})
export class PermissionDirective implements OnInit {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly view = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);
  private visible: boolean | null = null;

  readonly ctrlPermission = input.required<string | string[]>();

  constructor() {
    effect(() => {
      const allowed = this.allowed(this.ctrlPermission());
      untracked(() => this.apply(allowed));
    });
  }

  /** First paint is synchronous so permitted actions do not pop in a frame late. */
  ngOnInit(): void {
    this.apply(this.allowed(this.ctrlPermission()));
  }

  private allowed(required: string | string[]): boolean {
    return typeof required === 'string'
      ? this.auth.hasPermission(required)
      : this.auth.hasAnyPermission(required);
  }

  private apply(allowed: boolean): void {
    if (allowed === this.visible) {
      return;
    }
    this.visible = allowed;
    this.view.clear();
    if (allowed) {
      this.view.createEmbeddedView(this.template);
    }
  }
}
