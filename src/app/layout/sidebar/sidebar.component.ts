import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { Permission } from '../../core/models/permission.model';
import { AuthService } from '../../core/services/auth.service';

interface NavLink {
  kind: 'link';
  label: string;
  icon: string;
  route: string;
  /** Grant required to see this page. */
  permission: string;
  /** Exact match so a parent path does not stay active on sibling routes. */
  exact?: boolean;
}

interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: string;
  children: NavLink[];
}

type NavEntry = NavLink | NavGroup;

const link = (
  label: string,
  icon: string,
  route: string,
  permission: string,
  options?: { exact?: boolean },
): NavLink => ({
  kind: 'link',
  label,
  icon,
  route,
  permission,
  exact: options?.exact,
});

@Component({
  selector: 'ctrl-sidebar',
  standalone: true,
  imports: [NgClass, NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  collapsed = input(false);
  mobile = input(false);
  toggleCollapse = output<void>();
  /** Fired when a nav link is activated (used to close the mobile drawer). */
  navigate = output<void>();

  readonly navItems: NavEntry[] = [
    link('التحليلات', 'pi-chart-line', '/analytics', Permission.AnalyticsRead),
    {
      kind: 'group',
      id: 'zones',
      label: 'إدارة المناطق',
      icon: 'pi-map',
      children: [
        link('المناطق', 'pi-map-marker', '/zones', Permission.ZonesRead),
        link('المناطق الفرعية', 'pi-clone', '/sub-zones', Permission.ZonesRead),
        link('الشوارع ومراكز الانطلاق', 'pi-sitemap', '/hubs', Permission.ZonesRead),
      ],
    },
    {
      kind: 'group',
      id: 'vendors',
      label: 'إدارة المتاجر',
      icon: 'pi-building',
      children: [
        link('المتاجر', 'pi-shop', '/vendors', Permission.VendorsRead),
        link('فئات المتاجر', 'pi-th-large', '/vendor-categories', Permission.VendorsRead),
      ],
    },
    link('المنتجات', 'pi-tag', '/catalog', Permission.CatalogRead),
    {
      kind: 'group',
      id: 'orders',
      label: 'الطلبات',
      icon: 'pi-list',
      children: [
        link('الطلبات المباشرة', 'pi-bolt', '/orders', Permission.OrdersRead, { exact: true }),
        link('إنشاء طلب جديد', 'pi-plus', '/orders/create', Permission.OrdersUpdate),
        link('سجل الطلبات', 'pi-history', '/orders/history', Permission.OrdersRead),
      ],
    },
    link('الكباتن', 'pi-car', '/drivers', Permission.DriversRead),
    link('الماليات', 'pi-wallet', '/financials', Permission.FinancialsRead),
    link('الموظفين', 'pi-shield', '/staff', Permission.StaffRead),
    link('الأدوار والصلاحيات', 'pi-key', '/roles', Permission.StaffRead),
    link('العملاء', 'pi-users', '/customers', Permission.CustomersRead),
    link('سجل التعديلات', 'pi-clock', '/audit-log', Permission.AuditRead),
  ];

  /** Sidebar entries the signed-in user is allowed to open. */
  readonly visibleNav = computed(() => {
    const allow = (permission: string) => this.auth.hasPermission(permission);
    return this.navItems.flatMap((entry): NavEntry[] => {
      if (entry.kind === 'link') {
        return allow(entry.permission) ? [entry] : [];
      }
      const children = entry.children.filter((child) => allow(child.permission));
      return children.length === 0 ? [] : [{ ...entry, children }];
    });
  });

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  private readonly openGroups = signal<ReadonlySet<string>>(new Set());

  /** Group ids that contain the active route. */
  readonly activeGroups = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    const active = new Set<string>();
    for (const entry of this.visibleNav()) {
      if (
        entry.kind === 'group' &&
        entry.children.some((child) => path === child.route || path.startsWith(`${child.route}/`))
      ) {
        active.add(entry.id);
      }
    }
    return active;
  });

  constructor() {
    effect(() => {
      const active = this.activeGroups();
      if (active.size === 0) {
        return;
      }
      this.openGroups.update((open) => new Set([...open, ...active]));
    });
  }

  readonly exactMatch = { exact: true };
  readonly prefixMatch = { exact: false };

  /** Order detail pages stay under Live Orders, without lighting up Create or History. */
  boardDetailActive(item: NavLink): boolean {
    if (item.route !== '/orders') {
      return false;
    }
    const path = this.currentUrl().split(/[?#]/)[0];
    return /^\/orders\/(?!create$|history$)[^/]+$/.test(path);
  }

  isOpen(groupId: string): boolean {
    return this.openGroups().has(groupId);
  }

  toggleGroup(groupId: string): void {
    this.openGroups.update((open) => {
      const next = new Set(open);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  onNavClick(): void {
    this.navigate.emit();
  }
}
