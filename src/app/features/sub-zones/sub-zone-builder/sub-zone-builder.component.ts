import {
  AfterViewInit,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import * as turf from '@turf/turf';

import { ZoneService } from '../../../core/services/zone.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import { normalizeZonePolygon, type ZonePolygon } from '../../../core/models/zone.model';
import {
  DEFAULT_SUB_ZONE_COLOR,
  SUB_ZONE_COLOR_PRESETS,
  type SubZone,
} from '../../../core/models/sub-zone.model';
import {
  SubZoneMapComponent,
  type MapPolygonChanged,
  type MapPolygonCreated,
} from '../sub-zone-map/sub-zone-map.component';

interface SubZoneDraft {
  layerId: number;
  name: string;
  minOrder: number;
  color: string;
  geometry: ZonePolygon;
  areaSqKm: number;
}

@Component({
  selector: 'ctrl-sub-zone-builder',
  standalone: true,
  imports: [
    NgClass,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    SubZoneMapComponent,
  ],
  templateUrl: './sub-zone-builder.component.html',
  styleUrl: './sub-zone-builder.component.scss',
})
export class SubZoneBuilderComponent implements OnInit, AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zoneService = inject(ZoneService);
  private readonly subZoneService = inject(SubZoneService);
  private readonly map = viewChild(SubZoneMapComponent);

  readonly colorPresets = SUB_ZONE_COLOR_PRESETS;
  readonly zones = this.zoneService.zones;

  readonly subZoneId = signal<string | null>(null);
  readonly missing = signal(false);
  readonly submitted = signal(false);
  readonly subZones = signal<SubZoneDraft[]>([]);
  private existingForEdit: SubZone | null = null;

  readonly subZoneForm = new FormGroup({
    parentZoneId: new FormControl('', {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
  readonly parentZoneIdControl = this.subZoneForm.controls.parentZoneId;
  readonly parentZoneId = toSignal(this.parentZoneIdControl.valueChanges, {
    initialValue: this.parentZoneIdControl.value,
  });

  /** Set when opened from a zone row (`?parentId=`); the parent is fixed for this session. */
  readonly presetParentId = signal<string | null>(null);

  readonly parentLocked = computed(
    () => !!this.presetParentId() || !!this.subZoneId() || this.subZones().length > 0,
  );

  /** Return to the zones list when the user arrived from it. */
  readonly backRoute = computed(() => (this.presetParentId() ? '/zones' : '/sub-zones'));
  readonly backLabel = computed(() =>
    this.presetParentId() ? 'العودة إلى المناطق' : 'العودة إلى المناطق الفرعية',
  );

  readonly parentZone = computed(() => {
    const id = this.parentZoneId();
    return id ? this.zones().find((zone) => zone.id === id) ?? null : null;
  });
  readonly parentGeometry = computed(() => this.parentZone()?.polygon ?? null);

  readonly siblings = computed(() => {
    const parentId = this.parentZoneId();
    const selfId = this.subZoneId();
    if (!parentId) {
      return [];
    }
    return this.subZoneService
      .subZones()
      .filter((subZone) => subZone.parentZoneId === parentId && subZone.id !== selfId);
  });

  /** Validation messages indexed by Leaflet layer id. */
  readonly draftIssues = computed(() => {
    const issues = new Map<number, string[]>();
    const drafts = this.subZones();
    const parent = this.parentGeometry();
    const saved = this.siblings();

    for (const draft of drafts) {
      const messages: string[] = [];
      if (!draft.name.trim()) {
        messages.push('اسم المنطقة الفرعية مطلوب.');
      }
      if (!Number.isFinite(draft.minOrder) || draft.minOrder < 0) {
        messages.push('الحد الأدنى يجب أن يكون صفراً أو أكثر.');
      }

      const geometry = normalizeZonePolygon(draft.geometry);
      if (!geometry || !parent || !this.isWithin(geometry, parent)) {
        messages.push('المضلع يجب أن يقع بالكامل داخل المنطقة الرئيسية.');
      } else {
        const overlappingSaved = saved
          .filter((sibling) => this.polygonsOverlap(geometry, sibling.geometry))
          .map((sibling) => sibling.name);
        if (overlappingSaved.length > 0) {
          messages.push(`يتداخل مع منطقة موجودة: ${overlappingSaved.join('، ')}.`);
        }
      }
      issues.set(draft.layerId, messages);
    }

    for (let index = 0; index < drafts.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < drafts.length; otherIndex += 1) {
        const first = drafts[index];
        const second = drafts[otherIndex];
        if (this.polygonsOverlap(first.geometry, second.geometry)) {
          issues.get(first.layerId)?.push(`يتداخل مع المنطقة الجديدة رقم ${otherIndex + 1}.`);
          issues.get(second.layerId)?.push(`يتداخل مع المنطقة الجديدة رقم ${index + 1}.`);
        }
      }
    }

    return issues;
  });

  // `control.valid` is false while disabled and isn't reactive, so validity is derived from the value signal.
  readonly canSave = computed(
    () =>
      !!this.parentZone() &&
      this.subZones().length > 0 &&
      [...this.draftIssues().values()].every((messages) => messages.length === 0),
  );

  constructor() {
    effect(() => {
      const locked = this.parentLocked();
      if (locked) {
        this.parentZoneIdControl.disable({ emitEvent: false });
      } else {
        this.parentZoneIdControl.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.subZoneId.set(id);
    if (!id) {
      this.applyPresetParent(this.route.snapshot.queryParamMap.get('parentId'));
      return;
    }

    const existing = this.subZoneService.getById(id);
    if (!existing) {
      this.missing.set(true);
      return;
    }

    this.parentZoneIdControl.setValue(existing.parentZoneId);
    this.existingForEdit = existing;
  }

  ngAfterViewInit(): void {
    const existing = this.existingForEdit;
    if (!existing) {
      return;
    }
    queueMicrotask(() => {
      const created = this.map()?.addPolygon(existing.geometry, existing.color);
      if (!created) {
        return;
      }
      this.subZones.set([{
        ...created,
        name: existing.name,
        minOrder: existing.minOrder,
        color: existing.color,
      }]);
    });
  }

  onPolygonCreated(polygon: MapPolygonCreated): void {
    const color = this.createDistinctColor();
    this.map()?.updateLayerColor(polygon.layerId, color);
    this.subZones.update((drafts) => [
      ...drafts,
      {
        ...polygon,
        name: '',
        minOrder: this.parentZone()?.minOrder ?? 0,
        color,
      },
    ]);
  }

  onPolygonChanged(polygon: MapPolygonChanged): void {
    this.updateDraft(polygon.layerId, {
      geometry: polygon.geometry,
      areaSqKm: polygon.areaSqKm,
    });
  }

  onPolygonRemoved(layerId: number): void {
    this.subZones.update((drafts) => drafts.filter((draft) => draft.layerId !== layerId));
  }

  updateName(layerId: number, event: Event): void {
    this.updateDraft(layerId, { name: (event.target as HTMLInputElement).value });
  }

  updateMinOrder(layerId: number, value: number | null): void {
    this.updateDraft(layerId, { minOrder: value ?? 0 });
  }

  updateColor(layerId: number, color: string): void {
    this.updateDraft(layerId, { color });
    this.map()?.updateLayerColor(layerId, color);
  }

  removeDraft(layerId: number): void {
    this.map()?.removeLayer(layerId);
    this.onPolygonRemoved(layerId);
  }

  issuesFor(layerId: number): string[] {
    return this.draftIssues().get(layerId) ?? [];
  }

  onSubmit(): void {
    this.submitted.set(true);
    if (!this.canSave()) {
      this.parentZoneIdControl.markAsTouched();
      return;
    }

    // getRawValue() includes the disabled (locked) parent control, which `.value` omits.
    const { parentZoneId } = this.subZoneForm.getRawValue();
    const payloads = this.subZones().map(({ layerId: _layerId, areaSqKm: _area, ...draft }) => ({
      ...draft,
      isActive: true,
    }));

    const id = this.subZoneId();
    if (id) {
      this.subZoneService.update(id, { ...payloads[0], parentZoneId });
    } else {
      this.subZoneService.createMultipleSubZones(parentZoneId, payloads);
    }
    this.router.navigate([this.backRoute()]);
  }

  cancel(): void {
    this.map()?.clearDraftLayers();
    this.router.navigate([this.backRoute()]);
  }

  /** Unknown ids are ignored so a stale link degrades to the normal unlocked picker. */
  private applyPresetParent(parentId: string | null): void {
    if (!parentId || !this.zones().some((zone) => zone.id === parentId)) {
      return;
    }
    this.presetParentId.set(parentId);
    // Emits valueChanges → parentZoneId signal → parentGeometry → map draws and flies to the boundary.
    this.subZoneForm.patchValue({ parentZoneId: parentId });
  }

  private updateDraft(layerId: number, patch: Partial<SubZoneDraft>): void {
    this.subZones.update((drafts) =>
      drafts.map((draft) => draft.layerId === layerId ? { ...draft, ...patch } : draft),
    );
  }

  private isWithin(geometry: ZonePolygon, parent: ZonePolygon): boolean {
    try {
      return turf.booleanWithin(
        turf.polygon(geometry.coordinates),
        turf.polygon(parent.coordinates),
      );
    } catch {
      return false;
    }
  }

  /** A shared boundary has zero area and is valid; only interior overlap is rejected. */
  private polygonsOverlap(first: ZonePolygon, second: ZonePolygon): boolean {
    try {
      const intersection = turf.intersect(
        turf.featureCollection([
          turf.polygon(first.coordinates),
          turf.polygon(second.coordinates),
        ]),
      );
      return intersection !== null && turf.area(intersection) > 1;
    } catch {
      return true;
    }
  }

  private createDistinctColor(): string {
    const used = new Set([
      ...this.siblings().map((zone) => zone.color.toLowerCase()),
      ...this.subZones().map((draft) => draft.color.toLowerCase()),
    ]);
    const available = this.colorPresets.filter((color) => !used.has(color.toLowerCase()));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const hue = Math.floor(Math.random() * 360);
      const color = this.hslToHex(hue, 70, 48);
      if (!used.has(color)) {
        return color;
      }
    }
    return DEFAULT_SUB_ZONE_COLOR;
  }

  private hslToHex(hue: number, saturation: number, lightness: number): string {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const match = l - chroma / 2;
    const [red, green, blue] =
      hue < 60 ? [chroma, x, 0] :
      hue < 120 ? [x, chroma, 0] :
      hue < 180 ? [0, chroma, x] :
      hue < 240 ? [0, x, chroma] :
      hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
    return `#${[red, green, blue]
      .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
      .join('')}`;
  }
}
