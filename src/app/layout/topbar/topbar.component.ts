import { Component, output, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

const PAGE_TITLES: Record<string, string> = {
  analytics:  'لوحة التحليلات',
  zones:      'إدارة المناطق',
  geofencing: 'النطاقات الجغرافية',
  vendors:    'إدارة المتاجر',
  catalog:    'إدارة المنتجات',
  orders:     'إدارة الطلبات',
  drivers:    'إدارة السائقين',
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
        const segment = e.urlAfterRedirects.split('/').filter(Boolean).pop() ?? '';
        return PAGE_TITLES[segment] ?? 'كومبو كنترول';
      }),
    ),
    { initialValue: 'لوحة التحليلات' },
  );
}
