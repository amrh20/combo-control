import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2, inject } from '@angular/core';

/**
 * Adds a show/hide control to every password field in a component that imports it.
 * The selector matches `type="password"` inputs, so new fields pick it up automatically.
 */
@Directive({
  selector: 'input[type="password"]',
  standalone: true,
})
export class PasswordToggleDirective implements AfterViewInit, OnDestroy {
  private readonly inputRef = inject(ElementRef<HTMLInputElement>);
  private readonly renderer = inject(Renderer2);

  private wrap?: HTMLSpanElement;
  private button?: HTMLButtonElement;
  private icon?: HTMLElement;
  private visible = false;
  private unlistenClick?: () => void;
  private unlistenMouseDown?: () => void;

  ngAfterViewInit(): void {
    const input = this.inputRef.nativeElement;
    const parent = input.parentNode;
    if (!parent) {
      return;
    }

    const wrap = this.renderer.createElement('span') as HTMLSpanElement;
    this.renderer.addClass(wrap, 'password-toggle');
    const direction = input.getAttribute('dir') || getComputedStyle(input).direction;
    this.renderer.setAttribute(wrap, 'dir', direction === 'rtl' ? 'rtl' : 'ltr');

    this.renderer.insertBefore(parent, wrap, input);
    this.renderer.appendChild(wrap, input);
    this.renderer.setStyle(input, 'padding-inline-end', '2rem');

    const button = this.renderer.createElement('button') as HTMLButtonElement;
    this.renderer.setAttribute(button, 'type', 'button');
    this.renderer.addClass(button, 'password-toggle__btn');
    this.renderer.setAttribute(button, 'aria-pressed', 'false');
    this.renderer.setAttribute(button, 'aria-label', 'إظهار كلمة المرور');

    const icon = this.renderer.createElement('i') as HTMLElement;
    this.renderer.addClass(icon, 'pi');
    this.renderer.addClass(icon, 'pi-eye');
    this.renderer.setAttribute(icon, 'aria-hidden', 'true');
    this.renderer.appendChild(button, icon);
    this.renderer.appendChild(wrap, button);

    this.wrap = wrap;
    this.button = button;
    this.icon = icon;

    this.unlistenMouseDown = this.renderer.listen(button, 'mousedown', (event: MouseEvent) => {
      event.preventDefault();
    });
    this.unlistenClick = this.renderer.listen(button, 'click', (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
    });
  }

  ngOnDestroy(): void {
    this.unlistenClick?.();
    this.unlistenMouseDown?.();

    const wrap = this.wrap;
    const parent = wrap?.parentNode;
    if (!wrap || !parent) {
      return;
    }

    parent.insertBefore(this.inputRef.nativeElement, wrap);
    parent.removeChild(wrap);
    this.renderer.removeStyle(this.inputRef.nativeElement, 'padding-inline-end');
  }

  private toggle(): void {
    this.visible = !this.visible;
    const input = this.inputRef.nativeElement;
    this.renderer.setProperty(input, 'type', this.visible ? 'text' : 'password');

    if (this.icon) {
      this.renderer.removeClass(this.icon, this.visible ? 'pi-eye' : 'pi-eye-slash');
      this.renderer.addClass(this.icon, this.visible ? 'pi-eye-slash' : 'pi-eye');
    }

    if (this.button) {
      this.renderer.setAttribute(this.button, 'aria-pressed', String(this.visible));
      this.renderer.setAttribute(
        this.button,
        'aria-label',
        this.visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور',
      );
    }
  }
}
