import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import {
  CATEGORY_CONFIG,
  getEffectiveLiveStatus,
  getVendorInitials,
  LIVE_STATUS_CONFIG,
  LiveStatus,
  syncVendorsFromState,
  SystemStatus,
  updateVendor,
  VendorCategory,
  VendorProfile,
  ZONE_OPTIONS,
  matchesVendorFilters,
} from '../data/vendors.mock';

@Component({
  selector: 'ctrl-vendors-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    SelectModule,
    ToggleSwitchModule,
    ComboInputComponent,
  ],
  templateUrl: './vendors-list.component.html',
  styleUrl: './vendors-list.component.scss',
})
export class VendorsListComponent {
  readonly categoryConfig = CATEGORY_CONFIG;
  readonly liveStatusConfig = LIVE_STATUS_CONFIG;
  readonly zoneOptions = ZONE_OPTIONS;

  private readonly vendors = signal<VendorProfile[]>(syncVendorsFromState());

  readonly searchQuery = signal('');
  readonly categoryFilter = signal<VendorCategory | 'all'>('all');
  readonly zoneFilter = signal<string | 'all'>('all');
  readonly liveStatusFilter = signal<LiveStatus | 'all'>('all');

  readonly categoryFilterOptions = [
    { label: 'All Categories', value: 'all' as const },
    ...Object.entries(CATEGORY_CONFIG).map(([value, cfg]) => ({
      label: cfg.labelAr,
      value: value as VendorCategory,
    })),
  ];

  readonly zoneFilterOptions = [
    { label: 'All Zones', value: 'all' as const },
    ...ZONE_OPTIONS.map(z => ({ label: z.name, value: z.id })),
  ];

  readonly liveStatusFilterOptions = [
    { label: 'All Live Status', value: 'all' as const },
    ...Object.entries(LIVE_STATUS_CONFIG).map(([value, cfg]) => ({
      label: cfg.labelAr,
      value: value as LiveStatus,
    })),
  ];

  readonly filteredVendors = computed(() =>
    this.vendors().filter(v =>
      matchesVendorFilters(v, {
        search: this.searchQuery(),
        category: this.categoryFilter(),
        zoneId: this.zoneFilter(),
        liveStatus: this.liveStatusFilter(),
      }),
    ),
  );

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  onCategoryFilterChange(value: VendorCategory | 'all'): void {
    this.categoryFilter.set(value);
  }

  onZoneFilterChange(value: string | 'all'): void {
    this.zoneFilter.set(value);
  }

  onLiveStatusFilterChange(value: LiveStatus | 'all'): void {
    this.liveStatusFilter.set(value);
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchQuery() ||
      this.categoryFilter() !== 'all' ||
      this.zoneFilter() !== 'all' ||
      this.liveStatusFilter() !== 'all'
    );
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.categoryFilter.set('all');
    this.zoneFilter.set('all');
    this.liveStatusFilter.set('all');
  }

  getCategoryLabel(vendor: VendorProfile): string {
    return CATEGORY_CONFIG[vendor.category].labelAr;
  }

  getInitials(vendor: VendorProfile): string {
    return getVendorInitials(vendor.name);
  }

  getLiveStatus(vendor: VendorProfile): LiveStatus {
    return getEffectiveLiveStatus(vendor);
  }

  isSystemActive(vendor: VendorProfile): boolean {
    return vendor.systemStatus === 'active';
  }

  onSystemToggle(vendorId: string, active: boolean): void {
    const systemStatus: SystemStatus = active ? 'active' : 'inactive';
    updateVendor(vendorId, { systemStatus });
    this.vendors.update(list =>
      list.map(v => (v.id === vendorId ? { ...v, systemStatus } : v)),
    );
  }
}
