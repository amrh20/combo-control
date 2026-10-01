import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import {
  VendorCategory,
  VendorCategoryService,
  categoryTextColor,
  isCategoryIconImage,
} from '../../../core/services/vendor-category.service';
import { HubService } from '../../../core/services/hub.service';
import { VendorService } from '../../../core/services/vendor.service';
import {
  getEffectiveLiveStatus,
  getVendorInitials,
  LIVE_STATUS_CONFIG,
  LiveStatus,
  SystemStatus,
  VendorProfile,
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
  private readonly categoryService = inject(VendorCategoryService);
  private readonly hubService = inject(HubService);
  private readonly vendorService = inject(VendorService);

  readonly liveStatusConfig = LIVE_STATUS_CONFIG;

  readonly searchQuery = signal('');
  readonly categoryFilter = signal<string>('all');
  readonly hubFilter = signal<string | 'all'>('all');
  readonly liveStatusFilter = signal<LiveStatus | 'all'>('all');

  readonly categoryFilterOptions = computed(() => [
    { label: 'كل الفئات', value: 'all' },
    ...this.categoryService.categories().map((category) => ({
      label: category.isActive ? category.name : `${category.name} (غير نشطة)`,
      value: category.id,
    })),
  ]);

  readonly hubFilterOptions = computed(() => [
    { label: 'كل نقاط التجميع', value: 'all' as const },
    ...this.hubService.hubs().map((hub) => ({
      label: hub.isActive ? hub.name : `${hub.name} (غير نشطة)`,
      value: hub.id,
    })),
  ]);

  readonly liveStatusFilterOptions = [
    { label: 'كل الحالات المباشرة', value: 'all' as const },
    ...Object.entries(LIVE_STATUS_CONFIG).map(([value, cfg]) => ({
      label: cfg.labelAr,
      value: value as LiveStatus,
    })),
  ];

  readonly filteredVendors = computed(() => {
    const names = new Map(
      this.categoryService.categories().map((category) => [category.id, category.name]),
    );
    return this.vendorService.vendors()
      .map((vendor) => ({
        ...vendor,
        hubName: this.hubService.nameOf(vendor.hubId) || vendor.hubName,
      }))
      .filter((vendor) =>
        matchesVendorFilters(
          vendor,
          {
            search: this.searchQuery(),
            category: this.categoryFilter(),
            hubId: this.hubFilter(),
            liveStatus: this.liveStatusFilter(),
          },
          names.get(vendor.category) ?? '',
        ),
      );
  });

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  onCategoryFilterChange(value: string): void {
    this.categoryFilter.set(value);
  }

  onHubFilterChange(value: string | 'all'): void {
    this.hubFilter.set(value);
  }

  onLiveStatusFilterChange(value: LiveStatus | 'all'): void {
    this.liveStatusFilter.set(value);
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchQuery() ||
      this.categoryFilter() !== 'all' ||
      this.hubFilter() !== 'all' ||
      this.liveStatusFilter() !== 'all'
    );
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.categoryFilter.set('all');
    this.hubFilter.set('all');
    this.liveStatusFilter.set('all');
  }

  categoryOf(vendor: VendorProfile): VendorCategory | null {
    return this.categoryService.getById(vendor.category);
  }

  isImageIcon(iconUrl: string): boolean {
    return isCategoryIconImage(iconUrl);
  }

  categoryText(hex: string): string {
    return categoryTextColor(hex);
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
    this.vendorService.update(vendorId, { systemStatus });
  }
}
