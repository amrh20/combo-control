import { Component, ElementRef, HostListener, computed, inject, output, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

const PAGE_TITLES: Record<string, string> = {
  analytics:  'لوحة التحليلات',
  zones:      'إدارة المناطق',
  'sub-zones': 'المناطق الفرعية',
  hubs:       'الشوارع ومراكز الانطلاق',
  'vendor-categories': 'فئات المتاجر',
  vendors:    'إدارة المتاجر',
  catalog:    'إدارة المنتجات',
  orders:     'إدارة الطلبات',
  drivers:    'إدارة الكباتن',
  financials: 'الماليات',
  customers:  'العملاء',
};

const VENDOR_CATALOG_TITLE = 'تصنيفات المنتجات المتجر';

function titleForUrl(url: string): string {
  const path = url.split('?')[0];
  if (/^\/vendors\/[^/]+\/catalog\/products\//.test(path) || /^\/catalog\/(create|[^/]+\/edit)\/?$/.test(path)) {
    return 'المنتج';
  }
  if (/^\/vendors\/[^/]+\/catalog\/?$/.test(path)) {
    return VENDOR_CATALOG_TITLE;
  }
  const match = path.split('/').filter(Boolean).find((segment) => segment in PAGE_TITLES);
  return match ? PAGE_TITLES[match] : 'كومبو ';
}

@Component({
  selector: 'ctrl-topbar',
  standalone: true,
  imports: [],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  toggleSidebar = output<void>();

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly userMenu = viewChild<ElementRef<HTMLElement>>('userMenu');

  readonly menuOpen = signal(false);
  readonly displayName = computed(() => this.auth.currentUser()?.fullName?.trim() || 'مسؤول');
  readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  readonly avatarInitial = computed(() => this.displayName().charAt(0) || 'م');

  pageTitle = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => titleForUrl(e.urlAfterRedirects)),
    ),
    { initialValue: 'لوحة التحليلات' },
  );

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  logout(): void {
    this.menuOpen.set(false);
    this.auth.logout();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const root = this.userMenu()?.nativeElement;
    if (!this.menuOpen() || !root || !(event.target instanceof Node) || root.contains(event.target)) {
      return;
    }
    this.menuOpen.set(false);
  }
}
