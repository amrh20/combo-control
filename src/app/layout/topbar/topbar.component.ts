import { Component, output, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

const PAGE_TITLES: Record<string, string> = {
  analytics:  'Analytics Dashboard',
  zones:      'Zones Management',
  vendors:    'Vendors Management',
  catalog:    'Catalog Management',
  orders:     'Orders Management',
  fleet:      'Fleet Management',
  financials: 'Financials',
  customers:  'Customers',
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
        return PAGE_TITLES[segment] ?? 'Combo Control';
      }),
    ),
    { initialValue: 'Analytics Dashboard' },
  );
}
