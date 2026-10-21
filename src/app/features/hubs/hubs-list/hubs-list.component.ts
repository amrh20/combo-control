import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { HubService } from '../../../core/services/hub.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { ZoneService } from '../../../core/services/zone.service';
import {
  asStatusFilter,
  matchesSearch,
  matchesStatus,
  readControlValue,
  type StatusFilter,
} from '../../../shared/utils/list-filter';

@Component({
  selector: 'ctrl-hubs-list',
  standalone: true,
  imports: [NgClass, PermissionDirective, RouterLink, TableModule, ButtonModule],
  templateUrl: './hubs-list.component.html',
  styleUrl: './hubs-list.component.scss',
})
export class HubsListComponent implements OnInit {
  private readonly hubService = inject(HubService);
  private readonly subZoneService = inject(SubZoneService);
  private readonly zoneService = inject(ZoneService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loadError = signal<string | null>(null);

  readonly servedZones = this.subZoneService.subZones;
  readonly searchQuery = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly servedZoneFilter = signal('all');
  readonly pageFirst = signal(0);

  readonly rows = computed(() =>
    this.hubService.hubs().map((hub) => ({
      ...hub,
      servingZones: this.hubService.servingAreaNames(hub),
    })),
  );

  readonly filteredData = computed(() => {
    const query = this.searchQuery();
    const status = this.statusFilter();
    const servedZoneId = this.servedZoneFilter();
    return this.rows().filter(
      (hub) =>
        matchesSearch(query, hub.name, hub.id) &&
        matchesStatus(status, hub.isActive) &&
        (servedZoneId === 'all' || hub.servingSubZoneIds.includes(servedZoneId)),
    );
  });

  readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.statusFilter() !== 'all' ||
      this.servedZoneFilter() !== 'all',
  );

  ngOnInit(): void {
    forkJoin({
      zones: this.zoneService.getZones(),
      subZones: this.zoneService.getSubZones(),
      hubs: this.hubService.getHubs(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.loadError.set('تعذر تحميل الشوارع ومراكز الانطلاق.'),
      });
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set(readControlValue(event));
    this.pageFirst.set(0);
  }

  onStatusChange(event: Event): void {
    this.statusFilter.set(asStatusFilter(readControlValue(event)));
    this.pageFirst.set(0);
  }

  onServedZoneChange(event: Event): void {
    this.servedZoneFilter.set(readControlValue(event) || 'all');
    this.pageFirst.set(0);
  }

  onPage(event: { first?: number }): void {
    this.pageFirst.set(event.first ?? 0);
  }
}
