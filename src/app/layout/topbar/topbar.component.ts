import { Component, ElementRef, HostListener, computed, inject, output, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { OpsNotification } from '../../core/models/ops-notification.model';
import { formatOrderAge } from '../../core/models/ops-order.model';
import { AuthService } from '../../core/services/auth.service';
import { OpsNotificationService } from '../../core/services/ops-notification.service';

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
  private readonly notices = inject(OpsNotificationService);
  private readonly userMenu = viewChild<ElementRef<HTMLElement>>('userMenu');
  private readonly noticeMenu = viewChild<ElementRef<HTMLElement>>('noticeMenu');

  readonly menuOpen = signal(false);
  readonly noticesOpen = signal(false);
  readonly notifications = this.notices.notifications;
  readonly unreadCount = this.notices.unreadCount;
  readonly displayName = computed(() => this.auth.currentUser()?.fullName?.trim() || 'مسؤول');
  readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  readonly avatarInitial = computed(() => this.displayName().charAt(0) || 'م');
  readonly formatAge = formatOrderAge;

  pageTitle = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => titleForUrl(e.urlAfterRedirects)),
    ),
    { initialValue: 'لوحة التحليلات' },
  );

  toggleMenu(): void {
    this.noticesOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  toggleNotices(): void {
    this.menuOpen.set(false);
    this.noticesOpen.update((open) => !open);
  }

  openNotification(item: OpsNotification): void {
    this.noticesOpen.set(false);
    void this.notices.open(item);
  }

  logout(): void {
    this.menuOpen.set(false);
    this.noticesOpen.set(false);
    this.auth.logout();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
    this.noticesOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    const userRoot = this.userMenu()?.nativeElement;
    if (this.menuOpen() && userRoot && !userRoot.contains(target)) {
      this.menuOpen.set(false);
    }
    const noticeRoot = this.noticeMenu()?.nativeElement;
    if (this.noticesOpen() && noticeRoot && !noticeRoot.contains(target)) {
      this.noticesOpen.set(false);
    }
  }
}
