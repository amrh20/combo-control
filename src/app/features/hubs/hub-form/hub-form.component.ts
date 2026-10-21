import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { forkJoin, of } from 'rxjs';
import { GeometryInvalidError, GeometryOverlapError } from '../../../core/models/geometry-error';
import type { HubGeometry } from '../../../core/models/hub.model';
import { normalizeZonePolygon, type ZonePolygon } from '../../../core/models/zone.model';
import { HubService } from '../../../core/services/hub.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { ZoneService } from '../../../core/services/zone.service';
import { MapComponent, type MapOverlay, type MapPolygonChange } from '../../../shared/components/map/map.component';

interface ZoneGroup {
  zoneId: string;
  zoneName: string;
  selected: boolean;
  indeterminate: boolean;
  expanded: boolean;
  subZones: {
    id: string;
    name: string;
    selected: boolean;
  }[];
}

function atLeastOne(control: AbstractControl): ValidationErrors | null {
  const value = control.value as unknown;
  return Array.isArray(value) && value.length > 0 ? null : { required: true };
}

@Component({
  selector: 'ctrl-hub-form',
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
    InputTextModule,
    ToastModule,
    ToggleSwitchModule,
    MapComponent,
  ],
  providers: [MessageService],
  templateUrl: './hub-form.component.html',
  styleUrl: './hub-form.component.scss',
})
export class HubFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly hubService = inject(HubService);
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);

  readonly hubId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly missing = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly overlap = signal<ZonePolygon | null>(null);
  readonly mapOverlays = computed<MapOverlay[]>(() => {
    const overlap = this.overlap();
    if (!overlap) return [];
    return [{
      id: 'overlap',
      geometry: overlap,
      strokeColor: '#dc2626',
      fillColor: '#dc2626',
      fillOpacity: 0.35,
    }];
  });
  /** Polygon passed into the map once, so later edits do not redraw the layer. */
  readonly initialGeometry = signal<HubGeometry | null>(null);
  /** Latest polygon from the map, before the ring is closed for the payload. */
  readonly geometry = signal<HubGeometry | null>(null);
  readonly currentPolygonGeoJSON = computed(() => normalizeZonePolygon(this.geometry()));
  readonly geometryError = signal(false);
  readonly zoneGroups = signal<ZoneGroup[]>([]);
  readonly searchQuery = signal('');
  readonly hasSearch = computed(() => this.searchQuery().trim().length > 0);
  readonly filteredZoneGroups = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const groups = this.zoneGroups();
    if (!query) {
      return groups;
    }

    return groups.flatMap((group) => {
      if (group.zoneName.toLowerCase().includes(query)) {
        return [group];
      }

      const subZones = group.subZones.filter((subZone) =>
        subZone.name.toLowerCase().includes(query),
      );
      return subZones.length > 0 ? [{ ...group, subZones }] : [];
    });
  });
  readonly selectedSubZoneCount = computed(() => this.getSelectedSubZoneIds().length);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    servedAreas: [[] as string[], atLeastOne],
    isActive: [true],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.hubId.set(id);

    forkJoin({
      zones: this.zoneService.getZones(),
      subZones: this.zoneService.getSubZones(),
      hub: id ? this.hubService.getHubById(id) : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ hub }) => {
          if (id && !hub) {
            this.missing.set(true);
            this.loading.set(false);
            return;
          }
          if (hub) {
            this.buildZoneGroups(hub.servingSubZoneIds);
            this.initialGeometry.set(hub.geometry);
            this.geometry.set(hub.geometry);
            this.form.patchValue({
              name: hub.name,
              servedAreas: [...hub.servingSubZoneIds],
              isActive: hub.isActive,
            });
          } else {
            this.buildZoneGroups([]);
          }
          this.loading.set(false);
        },
        error: () => {
          if (id) {
            this.missing.set(true);
          } else {
            this.loadError.set('تعذر تحميل المناطق.');
          }
          this.loading.set(false);
        },
      });
  }

  invalid(field: 'name' | 'servedAreas'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.dirty || control.touched);
  }

  onGeometryChange(change: MapPolygonChange | null): void {
    this.geometry.set(change?.geometry ?? null);
    this.overlap.set(null);
    if (this.currentPolygonGeoJSON()) {
      this.geometryError.set(false);
    }
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  isGroupOpen(group: ZoneGroup): boolean {
    return group.expanded || this.hasSearch();
  }

  toggleExpanded(group: ZoneGroup): void {
    if (this.hasSearch()) {
      return;
    }
    this.zoneGroups.update((groups) =>
      groups.map((item) =>
        item.zoneId === group.zoneId ? { ...item, expanded: !item.expanded } : item,
      ),
    );
  }

  toggleParent(group: ZoneGroup): void {
    const selected = !group.selected;
    this.zoneGroups.update((groups) =>
      groups.map((item) =>
        item.zoneId === group.zoneId
          ? {
              ...item,
              selected,
              indeterminate: false,
              subZones: item.subZones.map((subZone) => ({ ...subZone, selected })),
            }
          : item,
      ),
    );
    this.syncServedAreas();
  }

  toggleChild(group: ZoneGroup, child: ZoneGroup['subZones'][number]): void {
    this.zoneGroups.update((groups) =>
      groups.map((item) => {
        if (item.zoneId !== group.zoneId) {
          return item;
        }
        const subZones = item.subZones.map((subZone) =>
          subZone.id === child.id ? { ...subZone, selected: !subZone.selected } : subZone,
        );
        const selectedCount = subZones.filter((subZone) => subZone.selected).length;
        return {
          ...item,
          subZones,
          selected: subZones.length > 0 && selectedCount === subZones.length,
          indeterminate: selectedCount > 0 && selectedCount < subZones.length,
        };
      }),
    );
    this.syncServedAreas();
  }

  getSelectedSubZoneIds(): string[] {
    return this.zoneGroups().flatMap((group) =>
      group.subZones.filter((subZone) => subZone.selected).map((subZone) => subZone.id),
    );
  }

  save(): void {
    const geometry = this.currentPolygonGeoJSON();
    if (this.form.invalid || !geometry) {
      this.form.markAllAsTouched();
      this.geometryError.set(!geometry);
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      name: raw.name,
      geometry,
      servingSubZoneIds: raw.servedAreas,
      isActive: raw.isActive,
    };

    const id = this.hubId();
    const request = id ? this.hubService.updateHub(id, payload) : this.hubService.createHub(payload);

    this.saving.set(true);
    this.overlap.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.router.navigate(['/hubs']),
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof GeometryOverlapError) {
          this.overlap.set(error.overlap);
          return;
        }
        this.messages.add({
          severity: 'error',
          summary: 'تعذر الحفظ',
          detail: error instanceof GeometryInvalidError ? error.message : 'تعذر حفظ الشارع أو المركز.',
          life: 6000,
        });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/hubs']);
  }

  private buildZoneGroups(selectedIds: readonly string[]): void {
    const selected = new Set(selectedIds);
    const activeSubZones = this.subZoneService.activeSubZones();

    this.zoneGroups.set(
      this.zoneService.activeZones().map((zone) => {
        const subZones = activeSubZones
          .filter((subZone) => subZone.parentZoneId === zone.id)
          .map((subZone) => ({
            id: subZone.id,
            name: subZone.name,
            selected: selected.has(subZone.id),
          }));
        const selectedCount = subZones.filter((subZone) => subZone.selected).length;
        return {
          zoneId: zone.id,
          zoneName: zone.name,
          selected: subZones.length > 0 && selectedCount === subZones.length,
          indeterminate: selectedCount > 0 && selectedCount < subZones.length,
          expanded: false,
          subZones,
        };
      }),
    );
  }

  private syncServedAreas(): void {
    this.form.controls.servedAreas.setValue(this.getSelectedSubZoneIds());
    this.form.controls.servedAreas.markAsDirty();
    this.form.controls.servedAreas.markAsTouched();
  }
}
