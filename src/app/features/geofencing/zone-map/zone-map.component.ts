import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import * as turf from '@turf/turf';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';

import { CAIRO_CENTER, DEFAULT_ZOOM } from '../models/zone.model';
import type { PolygonChange, ZoneGeometry } from '../models/zone.model';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

export interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  boundingBox?: [number, number, number, number];
}

@Component({
  selector: 'ctrl-zone-map',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './zone-map.component.html',
  styleUrl: './zone-map.component.scss',
})
export class ZoneMapComponent implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  /** Container element Leaflet mounts into. */
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  /** Existing polygon to draw on init (edit and read-only views). */
  readonly initialGeometry = input<ZoneGeometry | null>(null);
  /** Hides drawing tools. The polygon is shown but cannot be edited. */
  readonly readOnly = input(false);

  /** Emits the extracted GeoJSON (or null when the polygon is removed). */
  readonly polygonChanged = output<PolygonChange | null>();

  /** Drawn polygon area in km² — surfaced as a badge in the template. */
  readonly areaSqKm = signal<number | null>(null);
  /** Whether a polygon currently exists on the map. */
  readonly hasPolygon = signal(false);

  readonly searchQuery = signal('');
  readonly searchResults = signal<PlaceSearchResult[]>([]);
  readonly searchLoading = signal(false);
  readonly searchOpen = signal(false);

  private readonly search$ = new Subject<string>();

  private map?: L.Map;
  /** The single polygon layer allowed on the map at any time. */
  private currentLayer?: L.Layer;
  /** Temporary pin shown after a location search (not a Geoman layer). */
  private searchMarker?: L.CircleMarker;

  ngAfterViewInit(): void {
    this.initMap();
    this.initSearch();
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  /** Drop Geoman listeners and the Leaflet instance so nothing outlives the view. */
  private destroyMap(): void {
    const map = this.map;
    if (!map) {
      return;
    }

    this.clearSearchMarker();
    map.off('pm:create');
    map.off('pm:remove');
    if (this.currentLayer) {
      this.currentLayer.off('pm:edit');
      this.currentLayer.off('pm:update');
      this.currentLayer.off('pm:dragend');
      this.currentLayer = undefined;
    }
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

    if (!this.readOnly()) {
      // Geoman toolbar — only polygon drawing, editing and deletion.
      map.pm.addControls({
        position: 'topleft',
        drawPolygon: true,
        editMode: true,
        removalMode: true, // "deleteLayer"
        // Everything else explicitly off:
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

      // A drawn polygon should snap to a clean look.
      map.pm.setGlobalOptions({
        allowSelfIntersection: false,
        continueDrawing: false,
        templineStyle: { color: '#1f7a4d' },
        hintlineStyle: { color: '#1f7a4d', dashArray: '4,4' },
        pathOptions: {
          color: '#1f7a4d',
          fillColor: '#1f7a4d',
          fillOpacity: 0.15,
          weight: 2,
        },
      });

      map.on('pm:create', (e: any) => this.onPolygonCreated(e.layer as L.Layer));
      map.on('pm:remove', (e: any) => this.onPolygonRemoved(e.layer as L.Layer));
    }

    this.map = map;

    const existing = this.initialGeometry();
    if (existing) {
      this.drawGeometry(existing);
    }

    // The container lives inside a flex layout; make sure Leaflet measures
    // the real size once the view has painted.
    setTimeout(() => map.invalidateSize(), 0);
  }

  private drawGeometry(geometry: ZoneGeometry): void {
    if (!this.map) {
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

    const polygon = L.polygon(latLngs, {
      color: '#1f7a4d',
      fillColor: '#1f7a4d',
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(this.map);

    this.currentLayer = polygon;
    if (polygon.getBounds().isValid()) {
      this.map.fitBounds(polygon.getBounds(), { padding: [40, 40], maxZoom: 15 });
    }

    if (!this.readOnly()) {
      this.watchLayer(polygon);
      this.enableEditing(polygon);
      this.setDrawButtonDisabled(true);
    }

    this.extractAndEmit(polygon);
  }

  /** Show vertex handles immediately so a loaded zone is editable without the toolbar's Edit toggle. */
  private enableEditing(polygon: L.Polygon): void {
    polygon.pm?.enable({
      allowSelfIntersection: false,
      snappable: true,
      draggable: false,
    });
  }

  // ── Geoman event handlers ─────────────────────────────────
  private onPolygonCreated(layer: L.Layer): void {
    // STRICT RULE: only one polygon allowed. Clear the previous one so the
    // newest drawing always wins, then leave draw mode.
    if (this.currentLayer && this.currentLayer !== layer) {
      this.map?.removeLayer(this.currentLayer);
    }

    this.currentLayer = layer;
    this.map?.pm.disableDraw();
    this.setDrawButtonDisabled(true);
    this.watchLayer(layer);
    this.extractAndEmit(layer);
  }

  /** Keep zone geometry in sync while the polygon is edited or dragged. */
  private watchLayer(layer: L.Layer): void {
    const sync = () => this.extractAndEmit(layer);
    layer.on('pm:edit', sync);
    layer.on('pm:update', sync);
    layer.on('pm:dragend', sync);
  }

  private onPolygonRemoved(layer: L.Layer): void {
    if (layer !== this.currentLayer) {
      return;
    }
    this.currentLayer = undefined;
    this.areaSqKm.set(null);
    this.hasPolygon.set(false);
    this.setDrawButtonDisabled(false);
    this.polygonChanged.emit(null);
  }

  // ── Data extraction (Phase 4) ─────────────────────────────
  private extractAndEmit(layer: L.Layer): void {
    const feature = (layer as any).toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    const geometry = feature.geometry as ZoneGeometry;

    // Turf returns the area in square metres; convert to km².
    const areaSqKm = turf.area(feature) / 1_000_000;
    const rounded = Math.round(areaSqKm * 100) / 100;

    this.areaSqKm.set(rounded);
    this.hasPolygon.set(true);
    this.polygonChanged.emit({ geometry, areaSqKm: rounded });
  }

  /** Disable/enable the toolbar draw button while a polygon exists. */
  private setDrawButtonDisabled(disabled: boolean): void {
    try {
      this.map?.pm.Toolbar.setButtonDisabled('drawPolygon', disabled);
    } catch {
      // Older Geoman builds may name the button differently — the
      // clear-previous rule already guarantees a single polygon.
    }
  }

  // ── Location search (Nominatim / OpenStreetMap) ───────────
  private initSearch(): void {
    this.search$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        switchMap(query => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            this.searchLoading.set(false);
            return of([] as PlaceSearchResult[]);
          }

          this.searchLoading.set(true);
          return this.fetchPlaces(trimmed).pipe(
            catchError(() => of([] as PlaceSearchResult[])),
            finalize(() => this.searchLoading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(results => {
        this.searchResults.set(results);
        this.searchOpen.set(results.length > 0);
      });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);

    if (value.trim().length < 2) {
      this.searchResults.set([]);
      this.searchOpen.set(false);
      this.searchLoading.set(false);
      return;
    }

    this.searchLoading.set(true);
    this.search$.next(value);
  }

  onSearchFocus(): void {
    if (this.searchResults().length > 0) {
      this.searchOpen.set(true);
    }
  }

  closeSearchResults(): void {
    this.searchOpen.set(false);
  }

  selectPlace(place: PlaceSearchResult): void {
    this.searchQuery.set(place.displayName.split(',')[0] ?? place.displayName);
    this.searchOpen.set(false);
    this.searchResults.set([]);
    this.flyToPlace(place);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchOpen.set(false);
    this.clearSearchMarker();
  }

  private fetchPlaces(query: string) {
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'json')
      .set('limit', '6')
      .set('countrycodes', 'eg')
      .set('addressdetails', '0');

    return this.http
      .get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', { params })
      .pipe(
        switchMap(results =>
          of(results.map(item => this.toPlaceResult(item))),
        ),
      );
  }

  private toPlaceResult(item: NominatimResult): PlaceSearchResult {
    const result: PlaceSearchResult = {
      placeId: String(item.place_id),
      displayName: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    };

    if (item.boundingbox?.length === 4) {
      const [south, north, west, east] = item.boundingbox.map(Number) as [
        number,
        number,
        number,
        number,
      ];
      result.boundingBox = [south, north, west, east];
    }

    return result;
  }

  private flyToPlace(place: PlaceSearchResult): void {
    if (!this.map) {
      return;
    }

    if (place.boundingBox) {
      const [south, north, west, east] = place.boundingBox;
      this.map.fitBounds(
        L.latLngBounds(L.latLng(south, west), L.latLng(north, east)),
        { padding: [48, 48], maxZoom: 15 },
      );
    } else {
      this.map.flyTo([place.lat, place.lng], 14, { duration: 0.8 });
    }

    this.showSearchMarker(place.lat, place.lng);
  }

  private showSearchMarker(lat: number, lng: number): void {
    this.clearSearchMarker();

    this.searchMarker = L.circleMarker([lat, lng], {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#1f7a4d',
      fillOpacity: 1,
    }).addTo(this.map!);

    this.searchMarker.bindPopup(this.searchQuery()).openPopup();
  }

  private clearSearchMarker(): void {
    if (this.searchMarker && this.map) {
      this.map.removeLayer(this.searchMarker);
      this.searchMarker = undefined;
    }
  }
}
