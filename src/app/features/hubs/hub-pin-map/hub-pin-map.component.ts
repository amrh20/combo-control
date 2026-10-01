import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { geocoder, geocoders, type Geocoder } from 'leaflet-control-geocoder';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import type { HubGeometry } from '../../../core/models/hub.model';
import { CAIRO_CENTER, DEFAULT_ZOOM } from '../../../core/models/zone.model';

const HUB_PATH: L.PathOptions = {
  color: '#1f7a4d',
  fillColor: '#1f7a4d',
  fillOpacity: 0.15,
  weight: 2,
};

@Component({
  selector: 'ctrl-hub-pin-map',
  standalone: true,
  templateUrl: './hub-pin-map.component.html',
  styleUrl: './hub-pin-map.component.scss',
})
export class HubPinMapComponent implements AfterViewInit, OnDestroy {
  /** Saved street boundary to load in edit mode. Read once after the map mounts. */
  readonly geometry = input<HubGeometry | null>(null);
  /** GeoJSON Polygon from the single drawn layer, or null after it is deleted. */
  readonly geometryChange = output<HubGeometry | null>();

  readonly hasPolygon = signal(false);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map?: L.Map;
  private search?: Geocoder;
  /** The only polygon allowed on this hub. */
  private currentLayer?: L.Polygon;

  ngAfterViewInit(): void {
    const map = L.map(this.mapEl().nativeElement, {
      center: CAIRO_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

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

    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      continueDrawing: false,
      snappable: true,
      templineStyle: { color: '#1f7a4d' },
      hintlineStyle: { color: '#1f7a4d', dashArray: '4,4' },
      pathOptions: HUB_PATH,
    });

    map.on('pm:create', (event) => {
      const layer = event.layer;
      if (layer instanceof L.Polygon) {
        this.onPolygonCreated(layer);
        return;
      }
      map.removeLayer(layer);
    });
    map.on('pm:remove', (event) => this.onPolygonRemoved(event.layer));

    this.map = map;
    this.addGeocoder(map);

    const existing = this.geometry();
    if (existing) {
      this.drawGeometry(existing);
    }

    setTimeout(() => map.invalidateSize(), 0);
  }

  ngOnDestroy(): void {
    const map = this.map;
    this.search?.off();
    this.search = undefined;
    if (!map) {
      return;
    }

    map.off('pm:create');
    map.off('pm:remove');
    this.currentLayer?.off();
    this.currentLayer = undefined;
    map.remove();
    this.map = undefined;
  }

  /**
   * Search sits on the physical top-right. Zoom and the polygon toolbar stay
   * top-left, so the controls do not stack on top of each other. The input
   * itself is RTL for Arabic queries. A result only moves the camera.
   */
  private addGeocoder(map: L.Map): void {
    const control = geocoder({
      position: 'topright',
      collapsed: false,
      placeholder: 'ابحث عن الشارع أو المنطقة...',
      errorMessage: 'لم يتم العثور على نتائج.',
      iconLabel: 'بحث عن الشارع أو المنطقة',
      defaultMarkGeocode: false,
      showResultIcons: false,
      queryMinLength: 2,
      suggestMinLength: 2,
      geocoder: new geocoders.Photon({
        geocodingQueryParams: {
          // Photon rejects `ar` (400). `default` returns the local OSM name, Arabic inside Egypt.
          lang: 'default',
          limit: 6,
          // Photon has no countrycodes filter. bbox is minLon,minLat,maxLon,maxLat.
          bbox: '24.7,22.0,36.9,31.6',
        },
      }),
    });

    control.on('markgeocode', (event) => this.onGeocode(event.geocode));
    control.addTo(map);
    this.search = control;
  }

  private onGeocode(result: { bbox: L.LatLngBounds; center: L.LatLng }): void {
    const map = this.map;
    if (!map) {
      return;
    }

    if (result.bbox?.isValid()) {
      map.fitBounds(result.bbox, { padding: [48, 48], maxZoom: 17 });
    } else {
      map.flyTo(result.center, 16, { duration: 0.8 });
    }
  }

  private drawGeometry(geometry: HubGeometry): void {
    const map = this.map;
    if (!map) {
      return;
    }

    const ring = geometry.coordinates[0] ?? [];
    const latLngs = ring.map(([lng, lat]) => L.latLng(lat, lng));
    if (latLngs.length > 1) {
      const first = latLngs[0];
      const last = latLngs[latLngs.length - 1];
      if (first.equals(last)) {
        latLngs.pop();
      }
    }

    if (latLngs.length < 3) {
      return;
    }

    const polygon = L.polygon(latLngs, HUB_PATH).addTo(map);
    this.currentLayer = polygon;
    if (polygon.getBounds().isValid()) {
      map.fitBounds(polygon.getBounds(), { padding: [40, 40], maxZoom: 17 });
    }

    this.watchLayer(polygon);
    this.enableEditing(polygon);
    this.setDrawButtonDisabled(true);
    this.hasPolygon.set(true);
  }

  /** Vertex handles stay on so a loaded street can be adjusted without the Edit toggle. */
  private enableEditing(polygon: L.Polygon): void {
    polygon.pm.enable({
      allowSelfIntersection: false,
      snappable: true,
      draggable: false,
    });
  }

  private onPolygonCreated(layer: L.Polygon): void {
    const previous = this.currentLayer;
    this.currentLayer = layer;
    if (previous && previous !== layer) {
      previous.off();
      this.map?.removeLayer(previous);
    }

    this.map?.pm.disableDraw();
    this.setDrawButtonDisabled(true);
    this.watchLayer(layer);
    this.extractAndEmit(layer);
    // Enable after Geoman finishes the create cycle, so vertex handles attach cleanly.
    setTimeout(() => {
      if (this.currentLayer === layer) {
        this.enableEditing(layer);
      }
    }, 0);
  }

  private watchLayer(layer: L.Polygon): void {
    const sync = () => this.extractAndEmit(layer);
    layer.on('pm:edit', sync);
    layer.on('pm:update', sync);
    layer.on('pm:dragend', sync);
  }

  private onPolygonRemoved(layer: L.Layer): void {
    const current = this.currentLayer;
    if (!current || layer !== current) {
      return;
    }
    current.off();
    this.currentLayer = undefined;
    this.hasPolygon.set(false);
    this.setDrawButtonDisabled(false);
    this.geometryChange.emit(null);
  }

  private extractAndEmit(layer: L.Polygon): void {
    const feature = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    this.hasPolygon.set(true);
    this.geometryChange.emit(feature.geometry);
  }

  /** A hub holds one boundary. Drawing stays off until that polygon is deleted. */
  private setDrawButtonDisabled(disabled: boolean): void {
    try {
      this.map?.pm.Toolbar.setButtonDisabled('drawPolygon', disabled);
    } catch {
      // Older Geoman builds may name the button differently. The create handler
      // still drops any previous polygon.
    }
  }
}
