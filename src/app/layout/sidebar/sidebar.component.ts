import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';

interface NavLink {
  kind: 'link';
  label: string;
  icon: string;
  route: string;
}

interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: string;
  children: NavLink[];
}

type NavEntry = NavLink | NavGroup;

const link = (label: string, icon: string, route: string): NavLink => ({ kind: 'link', label, icon, route });

@Component({
  selector: 'ctrl-sidebar',
  standalone: true,
  imports: [NgClass, NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly router = inject(Router);

  collapsed = input(false);
  mobile = input(false);
  toggleCollapse = output<void>();
  /** Fired when a nav link is activated (used to close the mobile drawer). */
  navigate = output<void>();

  readonly navItems: NavEntry[] = [
    link('التحليلات', 'pi-chart-line', '/analytics'),
    {
      kind: 'group',
      id: 'zones',
      label: 'إدارة المناطق',
      icon: 'pi-map',
      children: [
        link('المناطق', 'pi-map-marker', '/zones'),
        link('المناطق الفرعية', 'pi-clone', '/sub-zones'),
        link('الشوارع ومراكز الانطلاق', 'pi-sitemap', '/hubs'),
      ],
    },
    {
      kind: 'group',
      id: 'vendors',
      label: 'إدارة المتاجر',
      icon: 'pi-building',
      children: [
        link('المتاجر', 'pi-shop', '/vendors'),
        link('فئات المتاجر', 'pi-th-large', '/vendor-categories'),
      ],
    },
    link('المنتجات', 'pi-tag', '/catalog'),
    link('الطلبات', 'pi-list', '/orders'),
    link('الكباتن', 'pi-car', '/drivers'),
    link('الماليات', 'pi-wallet', '/financials'),
    link('العملاء', 'pi-users', '/customers'),
  ];

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
    for (const entry of this.navItems) {
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
