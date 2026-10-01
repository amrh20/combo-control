import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { ZoneService } from '../../../core/services/zone.service';
import type { SubZone } from '../../../core/models/sub-zone.model';
import {
  asStatusFilter,
  matchesSearch,
  matchesStatus,
  readControlValue,
  type StatusFilter,
} from '../../../shared/utils/list-filter';

@Component({
  selector: 'ctrl-sub-zone-list',
  standalone: true,
  imports: [NgClass, DecimalPipe, RouterLink, TableModule, ButtonModule],
  templateUrl: './sub-zone-list.component.html',
  styleUrl: './sub-zone-list.component.scss',
})
export class SubZoneListComponent {
  private readonly subZoneService = inject(SubZoneService);
  private readonly zoneService = inject(ZoneService);

  readonly parentZones = this.zoneService.zones;
  readonly searchQuery = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly parentFilter = signal('all');
  readonly pageFirst = signal(0);

  readonly rows = computed(() => {
    const zones = this.zoneService.zones();
    return this.subZoneService.subZones().map((subZone) => ({
      ...subZone,
      parentZoneName: zones.find((zone) => zone.id === subZone.parentZoneId)?.name ?? '—',
    }));
  });

  readonly filteredData = computed(() => {
    const query = this.searchQuery();
    const status = this.statusFilter();
    const parentId = this.parentFilter();
    return this.rows().filter(
      (subZone) =>
        matchesSearch(query, subZone.name, subZone.id) &&
        matchesStatus(status, subZone.isActive) &&
        (parentId === 'all' || subZone.parentZoneId === parentId),
    );
  });

  readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.statusFilter() !== 'all' ||
      this.parentFilter() !== 'all',
  );

  onSearchInput(event: Event): void {
    this.searchQuery.set(readControlValue(event));
    this.pageFirst.set(0);
  }

  onStatusChange(event: Event): void {
    this.statusFilter.set(asStatusFilter(readControlValue(event)));
    this.pageFirst.set(0);
  }

  onParentChange(event: Event): void {
    this.parentFilter.set(readControlValue(event) || 'all');
    this.pageFirst.set(0);
  }

  onPage(event: { first?: number }): void {
    this.pageFirst.set(event.first ?? 0);
  }

  remove(subZone: SubZone): void {
    if (!confirm(`هل أنت متأكد من حذف المنطقة الفرعية "${subZone.name}"؟`)) {
      return;
    }
    this.subZoneService.remove(subZone.id);
  }
}
