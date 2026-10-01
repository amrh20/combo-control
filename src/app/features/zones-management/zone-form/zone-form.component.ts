import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ZoneService } from '../../../core/services/zone.service';
import {
  normalizeZonePolygon,
  type ZonePolygon,
  type ZoneWritePayload,
} from '../../../core/models/zone.model';
import { ZoneMapComponent } from '../../geofencing/zone-map/zone-map.component';
import type { PolygonChange } from '../../geofencing/models/zone.model';

@Component({
  selector: 'ctrl-zone-builder',
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    ToggleSwitchModule,
    ZoneMapComponent,
  ],
  templateUrl: './zone-form.component.html',
  styleUrl: './zone-form.component.scss',
})
export class ZoneFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zoneService = inject(ZoneService);

  readonly zoneId = signal<string | null>(null);
  readonly missing = signal(false);
  /** Latest polygon emitted by the map, before GeoJSON normalization. */
  readonly zoneGeometry = signal<ZonePolygon | null>(null);
  /** Closed GeoJSON Polygon attached to the save payload, or null when invalid. */
  readonly currentPolygonGeoJSON = computed(() => normalizeZonePolygon(this.zoneGeometry()));
  readonly initialGeometry = signal<ZonePolygon | null>(null);
  readonly areaSqKm = signal<number | null>(null);
  readonly geometryError = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    minOrder: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.zoneId.set(id);
    if (!id) {
      return;
    }

    const existing = this.zoneService.getById(id);
    if (!existing) {
      this.missing.set(true);
      return;
    }

    this.form.patchValue({
      name: existing.name,
      minOrder: existing.minOrder,
      isActive: existing.isActive,
    });
    this.initialGeometry.set(existing.polygon);
    this.zoneGeometry.set(existing.polygon);
  }

  onPolygonChanged(change: PolygonChange | null): void {
    this.zoneGeometry.set(change?.geometry ?? null);
    this.areaSqKm.set(change?.areaSqKm ?? null);
    if (this.currentPolygonGeoJSON()) {
      this.geometryError.set(false);
    }
  }

  invalid(field: 'name' | 'minOrder'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.dirty || control.touched);
  }

  onSubmit(): void {
    const currentPolygonGeoJSON = this.currentPolygonGeoJSON();
    if (this.form.invalid || !currentPolygonGeoJSON) {
      this.form.markAllAsTouched();
      this.geometryError.set(!currentPolygonGeoJSON);
      return;
    }

    const zonePayload: ZoneWritePayload = {
      ...this.form.getRawValue(),
      geometry: currentPolygonGeoJSON,
    };

    const id = this.zoneId();
    if (id) {
      this.zoneService.update(id, zonePayload);
    } else {
      this.zoneService.add(zonePayload);
    }
    this.router.navigate(['/zones']);
  }

  cancel(): void {
    this.router.navigate(['/zones']);
  }
}
