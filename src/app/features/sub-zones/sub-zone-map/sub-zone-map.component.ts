import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import * as turf from '@turf/turf';

import { CAIRO_CENTER, DEFAULT_ZOOM, type ZonePolygon } from '../../../core/models/zone.model';
import { DEFAULT_SUB_ZONE_COLOR, type SubZone } from '../../../core/models/sub-zone.model';

export interface MapPolygonCreated {
  layerId: number;
  geometry: ZonePolygon;
  areaSqKm: number;
}

export interface MapPolygonChanged extends MapPolygonCreated {}

const PARENT_STYLE: L.PathOptions = {
  color: 'gray',
  weight: 2,
  dashArray: '5,5',
  fillColor: 'gray',
  fillOpacity: 0.1,
};

@Component({
  selector: 'ctrl-sub-zone-map',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './sub-zone-map.component.html',
  styleUrl: './sub-zone-map.component.scss',
})
export class SubZoneMapComponent implements AfterViewInit, OnDestroy {
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  /** Parent zone boundary, rendered as a read-only background constraint. */
  readonly parentGeometry = input<ZonePolygon | null>(null);
  /** Other sub-zones of the same parent, shown faintly to avoid overlaps. */
  readonly siblings = input<readonly SubZone[]>([]);

  readonly polygonCreated = output<MapPolygonCreated>();
  readonly polygonChanged = output<MapPolygonChanged>();
  readonly polygonRemoved = output<number>();

  readonly polygonCount = signal(0);
  readonly totalAreaSqKm = signal(0);

  private readonly mapReady = signal(false);
  private map?: L.Map;
  /** Parent + sibling layers. Cleared as a unit whenever the parent changes. */
  private contextLayer?: L.FeatureGroup;
  /** Editable draft layers, keyed by Leaflet's stable layer id. */
  private readonly draftLayers = new Map<number, L.Polygon>();

  constructor() {
    effect(() => {
      const parent = this.parentGeometry();
      const siblings = this.siblings();
      if (!this.mapReady()) {
        return;
      }
      untracked(() => this.renderContext(parent, siblings));
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    map.off('pm:create');
    map.off('pm:remove');
    for (const layer of this.draftLayers.values()) {
      layer.off();
    }
    this.draftLayers.clear();
    this.contextLayer?.clearLayers();
    this.contextLayer = undefined;
    map.remove();
    this.map = undefined;
  }

  // ── Map setup ─────────────────────────────────────────────
  private initMap(): void {
    const map = L.map(this.mapEl().nativeElement, {
      center: CAIRO_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      editMode: true,
      removalMode: true,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      dragMode: false,
      cutPolygon: false,
      rotateMode: false,
    });

    this.applyDrawingStyle(DEFAULT_SUB_ZONE_COLOR);

    map.on('pm:create', (e: any) => this.onPolygonCreated(e.layer as L.Polygon));
    map.on('pm:remove', (e: any) => this.onPolygonRemoved(e.layer as L.Layer));

    this.contextLayer = L.featureGroup([], { pmIgnore: true }).addTo(map);
    this.map = map;

    this.mapReady.set(true);
    setTimeout(() => map.invalidateSize(), 0);
  }

  // ── Parent / sibling context ──────────────────────────────
  private renderContext(parent: ZonePolygon | null, siblings: readonly SubZone[]): void {
    const map = this.map;
    const context = this.contextLayer;
    if (!map || !context) {
      return;
    }

    context.clearLayers();

    for (const sibling of siblings) {
      const siblingLayer = L.geoJSON(sibling.geometry, {
        interactive: false,
        pmIgnore: true,
        snapIgnore: false,
        style: {
          color: sibling.color,
          weight: 1,
          opacity: 0.6,
          fillColor: sibling.color,
          fillOpacity: 0.08,
        },
      }).addTo(context);
      this.lockLayer(siblingLayer);
    }

    if (parent) {
      const parentLayer = L.geoJSON(parent, {
        interactive: false,
        pmIgnore: true,
        snapIgnore: false,
        style: PARENT_STYLE,
      }).addTo(context);
      this.lockLayer(parentLayer);

      const bounds = parentLayer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 0.8 });
      }
    } else {
      map.pm.disableDraw();
    }

    context.bringToBack();
    this.syncDrawButton();
  }

  /**
   * Context polygons are snap targets only. `pmIgnore` already keeps them out of the
   * toolbar's global edit mode; disabling here guards against any handler that was attached.
   */
  private lockLayer(group: L.GeoJSON): void {
    group.eachLayer((layer) => (layer as L.Polygon).pm?.disable());
  }

  // ── Draft polygon lifecycle ───────────────────────────────
  private onPolygonCreated(layer: L.Polygon): void {
    const data = this.attachLayer(layer);
    this.polygonCreated.emit(data);
  }

  private attachLayer(layer: L.Polygon): MapPolygonCreated {
    const layerId = L.stamp(layer);
    this.draftLayers.set(layerId, layer);
    const sync = () => this.extractAndEmit(layer);
    layer.on('pm:edit', sync);
    layer.on('pm:update', sync);
    layer.on('pm:dragend', sync);
    this.updateSummary();
    return this.extract(layer);
  }

  private onPolygonRemoved(layer: L.Layer): void {
    const layerId = L.stamp(layer);
    const polygon = this.draftLayers.get(layerId);
    if (!polygon) {
      return;
    }
    polygon.off();
    this.draftLayers.delete(layerId);
    this.updateSummary();
    this.polygonRemoved.emit(layerId);
  }

  private extractAndEmit(layer: L.Polygon): void {
    this.updateSummary();
    this.polygonChanged.emit(this.extract(layer));
  }

  private extract(layer: L.Polygon): MapPolygonCreated {
    const feature = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    const geometry = feature.geometry as ZonePolygon;
    const areaSqKm = Math.round((turf.area(feature) / 1_000_000) * 100) / 100;
    return { layerId: L.stamp(layer), geometry, areaSqKm };
  }

  /** Add a stored geometry to the editable draft set (single-item edit route). */
  addPolygon(geometry: ZonePolygon, color: string): MapPolygonCreated | null {
    if (!this.map) {
      return null;
    }
    const wrapper = L.geoJSON(geometry, { style: this.pathStyle(color) });
    const polygon = wrapper.getLayers()[0] as L.Polygon | undefined;
    if (!polygon) {
      return null;
    }
    // Detach from the throwaway GeoJSON group so the polygon is a standalone Geoman layer.
    wrapper.removeLayer(polygon);
    polygon.addTo(this.map);
    const created = this.attachLayer(polygon);
    // Show vertex handles immediately so the stored shape is editable without the toolbar's Edit toggle.
    polygon.pm?.enable({
      allowSelfIntersection: false,
      snappable: true,
      draggable: false,
    });
    return created;
  }

  /** Called by a card color picker; updates exactly its matching Leaflet layer. */
  updateLayerColor(layerId: number, color: string): void {
    this.draftLayers.get(layerId)?.setStyle(this.pathStyle(color));
    this.applyDrawingStyle(color);
  }

  /** Called by card deletion. Removes listeners and the matching map layer. */
  removeLayer(layerId: number): void {
    const layer = this.draftLayers.get(layerId);
    if (!layer) {
      return;
    }
    layer.off();
    this.draftLayers.delete(layerId);
    this.map?.removeLayer(layer);
    this.updateSummary();
  }

  /** Remove all editable drafts without touching parent/sibling context layers. */
  clearDraftLayers(): void {
    for (const layerId of [...this.draftLayers.keys()]) {
      this.removeLayer(layerId);
    }
  }

  // ── Styling / summary ─────────────────────────────────────
  private applyDrawingStyle(color: string): void {
    this.map?.pm.setGlobalOptions({
      allowSelfIntersection: false,
      continueDrawing: false,
      snappable: true,
      templineStyle: { color },
      hintlineStyle: { color, dashArray: '4,4' },
      pathOptions: this.pathStyle(color),
    });
  }

  private pathStyle(color: string): L.PathOptions {
    return { color, fillColor: color, fillOpacity: 0.25, weight: 2 };
  }

  private updateSummary(): void {
    this.polygonCount.set(this.draftLayers.size);
    const totalArea = [...this.draftLayers.values()].reduce(
      (sum, layer) => sum + this.extract(layer).areaSqKm,
      0,
    );
    this.totalAreaSqKm.set(Math.round(totalArea * 100) / 100);
  }

  /** Drawing needs a parent boundary; once selected, any number of polygons is allowed. */
  private syncDrawButton(): void {
    const disabled = !this.parentGeometry();
    try {
      this.map?.pm.Toolbar.setButtonDisabled('drawPolygon', disabled);
    } catch {
      // Toolbar not mounted yet.
    }
  }
}
