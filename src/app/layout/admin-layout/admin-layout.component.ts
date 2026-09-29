import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

const MOBILE_BREAKPOINT = 991;

@Component({
  selector: 'ctrl-admin-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Desktop icon-rail collapse. Ignored on mobile. */
  readonly sidebarCollapsed = signal(false);

  /** Mobile off-canvas drawer open state. */
  readonly mobileNavOpen = signal(false);

  readonly isMobile = signal(
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT,
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      document.body.style.overflow = '';
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.closeMobileNav());
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncViewport();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileNavOpen()) {
      this.closeMobileNav();
    }
  }

  toggleSidebar(): void {
    if (this.isMobile()) {
      this.mobileNavOpen.update((open) => !open);
      this.syncBodyScroll();
      return;
    }
    this.sidebarCollapsed.update((v) => !v);
  }

  closeMobileNav(): void {
    if (!this.mobileNavOpen()) return;
    this.mobileNavOpen.set(false);
    this.syncBodyScroll();
  }

  private syncViewport(): void {
    const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const wasMobile = this.isMobile();
    this.isMobile.set(mobile);

    if (mobile !== wasMobile) {
      // Leaving mobile → close drawer; entering mobile → expand icon-rail
      this.mobileNavOpen.set(false);
      if (mobile) {
        this.sidebarCollapsed.set(false);
      }
      this.syncBodyScroll();
    }
  }

  private syncBodyScroll(): void {
    document.body.style.overflow = this.mobileNavOpen() ? 'hidden' : '';
  }
}
