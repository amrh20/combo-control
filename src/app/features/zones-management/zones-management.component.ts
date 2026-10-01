import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ZoneService } from '../../core/services/zone.service';
import { SubZoneService } from '../../core/services/sub-zone.service';
import type { SubZone } from '../../core/models/sub-zone.model';
import {
  asStatusFilter,
  matchesSearch,
  matchesStatus,
  readControlValue,
  type StatusFilter,
} from '../../shared/utils/list-filter';

@Component({
  selector: 'ctrl-zones-management',
  standalone: true,
  imports: [DecimalPipe, NgClass, RouterLink, TableModule, ButtonModule],
  templateUrl: './zones-management.component.html',
  styleUrl: './zones-management.component.scss',
})
export class ZonesManagementComponent {
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);

  readonly zones = this.zoneService.zones;
  readonly expandedIds = signal<ReadonlySet<string>>(new Set());
  readonly searchQuery = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly pageFirst = signal(0);

  readonly filteredData = computed(() => {
    const query = this.searchQuery();
    const status = this.statusFilter();
    return this.zones().filter(
      (zone) => matchesSearch(query, zone.name, zone.id) && matchesStatus(status, zone.isActive),
    );
  });

  readonly hasActiveFilters = computed(
    () => this.searchQuery().trim().length > 0 || this.statusFilter() !== 'all',
  );

  readonly subZonesByParent = computed(() => {
    const grouped = new Map<string, SubZone[]>();
    for (const subZone of this.subZoneService.subZones()) {
      const list = grouped.get(subZone.parentZoneId);
      if (list) {
        list.push(subZone);
      } else {
        grouped.set(subZone.parentZoneId, [subZone]);
      }
    }
    return grouped;
  });

  subZonesOf(zoneId: string): SubZone[] {
    return this.subZonesByParent().get(zoneId) ?? [];
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set(readControlValue(event));
    this.pageFirst.set(0);
  }

  onStatusChange(event: Event): void {
    this.statusFilter.set(asStatusFilter(readControlValue(event)));
    this.pageFirst.set(0);
  }

  onPage(event: { first?: number }): void {
    this.pageFirst.set(event.first ?? 0);
  }

  isExpanded(zoneId: string): boolean {
    return this.expandedIds().has(zoneId);
  }

  toggleRow(zoneId: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  }
}
