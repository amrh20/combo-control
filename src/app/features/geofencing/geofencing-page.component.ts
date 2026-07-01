import { Component, computed, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';

import { ZoneMapComponent } from './zone-map/zone-map.component';
import {
  GeofenceZoneFormComponent,
  ZoneFormValue,
} from './zone-form/zone-form.component';
import { CreateZonePayload, PolygonChange } from './models/zone.model';

@Component({
  selector: 'ctrl-geofencing-page',
  standalone: true,
  imports: [JsonPipe, ZoneMapComponent, GeofenceZoneFormComponent],
  templateUrl: './geofencing-page.component.html',
  styleUrl: './geofencing-page.component.scss',
})
export class GeofencingPageComponent {
  /** Latest geometry extracted from the map (null when no polygon). */
  private readonly polygon = signal<PolygonChange | null>(null);

  /** Drives the form's Save button + warnings. */
  readonly geometryReady = computed(() => this.polygon() !== null);
  readonly areaSqKm = computed(() => this.polygon()?.areaSqKm ?? null);

  /** The clean payload built on save — shown as a backend-ready preview. */
  readonly lastPayload = signal<CreateZonePayload | null>(null);

  onPolygonChanged(change: PolygonChange | null): void {
    this.polygon.set(change);
  }

  onSaveZone(value: ZoneFormValue): void {
    const geometry = this.polygon()?.geometry;
    if (!geometry) {
      return;
    }

    const payload: CreateZonePayload = {
      ...value,
      geometry,
    };

    // In a real app this is where you'd POST to the Node.js/PostGIS API.
    this.lastPayload.set(payload);
    console.log('CreateZonePayload →', payload);
  }
}
