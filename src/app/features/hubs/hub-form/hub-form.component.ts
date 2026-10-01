import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import type { HubGeometry } from '../../../core/models/hub.model';
import { normalizeZonePolygon } from '../../../core/models/zone.model';
import { HubService } from '../../../core/services/hub.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { ZoneService } from '../../../core/services/zone.service';
import { HubPinMapComponent } from '../hub-pin-map/hub-pin-map.component';

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
    ToggleSwitchModule,
    HubPinMapComponent,
  ],
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

  readonly hubId = signal<string | null>(null);
  readonly missing = signal(false);
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
    if (!id) {
      this.buildZoneGroups([]);
      return;
    }

    const existing = this.hubService.getById(id);
    if (!existing) {
      this.missing.set(true);
      return;
    }

    this.buildZoneGroups(existing.servingSubZoneIds);
    this.initialGeometry.set(existing.geometry);
    this.geometry.set(existing.geometry);
    this.form.patchValue({
      name: existing.name,
      servedAreas: [...existing.servingSubZoneIds],
      isActive: existing.isActive,
    });
  }

  invalid(field: 'name' | 'servedAreas'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.dirty || control.touched);
  }

  onGeometryChange(geometry: HubGeometry | null): void {
    this.geometry.set(geometry);
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
    if (id) {
      this.hubService.update(id, payload);
    } else {
      this.hubService.add(payload);
    }
    this.router.navigate(['/hubs']);
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
