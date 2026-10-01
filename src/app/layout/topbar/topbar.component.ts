import { Component, output, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

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

@Component({
  selector: 'ctrl-topbar',
  standalone: true,
  imports: [],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  toggleSidebar = output<void>();

  private router = inject(Router);

  pageTitle = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => {
        const segments = e.urlAfterRedirects.split('?')[0].split('/').filter(Boolean);
        const match = segments.find((segment) => segment in PAGE_TITLES);
        return match ? PAGE_TITLES[match] : 'كومبو كنترول';
      }),
    ),
    { initialValue: 'لوحة التحليلات' },
  );
}
