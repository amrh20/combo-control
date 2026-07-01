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
    { label: 'Analytics',  icon: 'pi-chart-line',  route: '/analytics' },
    { label: 'Zones',      icon: 'pi-map-marker',  route: '/zones' },
    { label: 'Geofencing', icon: 'pi-map',         route: '/geofencing' },
    { label: 'Vendors',    icon: 'pi-shop',        route: '/vendors' },
    { label: 'Catalog',    icon: 'pi-tag',         route: '/catalog' },
    { label: 'Orders',     icon: 'pi-list',        route: '/orders' },
    { label: 'Fleet',      icon: 'pi-car',         route: '/drivers' },
    { label: 'Financials', icon: 'pi-wallet',      route: '/financials' },
    { label: 'Customers',  icon: 'pi-users',       route: '/customers' },
  ];
}
