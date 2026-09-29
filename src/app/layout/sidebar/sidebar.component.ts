import { Component, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'ctrl-sidebar',
  standalone: true,
  imports: [NgClass, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  collapsed = input(false);
  toggleCollapse = output<void>();

  readonly navItems: NavItem[] = [
    { label: 'التحليلات',          icon: 'pi-chart-line',  route: '/analytics' },
    { label: 'المناطق',            icon: 'pi-map-marker',  route: '/zones' },
    { label: 'النطاقات الجغرافية', icon: 'pi-map',         route: '/geofencing' },
    { label: 'المتاجر',            icon: 'pi-shop',        route: '/vendors' },
    { label: 'المنتجات',           icon: 'pi-tag',         route: '/catalog' },
    { label: 'الطلبات',            icon: 'pi-list',        route: '/orders' },
    { label: 'السائقين',           icon: 'pi-car',         route: '/drivers' },
    { label: 'الماليات',           icon: 'pi-wallet',      route: '/financials' },
    { label: 'العملاء',            icon: 'pi-users',       route: '/customers' },
  ];
}
