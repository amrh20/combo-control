import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as turf from '@turf/turf';
import type { ZonePolygon } from '../../../core/models/zone.model';

/** Replace with a Maps JavaScript API key that has Places and Drawing enabled. */
export const GOOGLE_MAPS_API_KEY = 'AIzaSyAw7RIqxwWQYrdwbXvuSP5C6yHEym_odWc';

const MAPS_SCRIPT_ID = 'combo-google-maps-script';
const DEFAULT_LAT = 30.0444;
const DEFAULT_LNG = 31.2357;
const DEFAULT_POLYGON_COLOR = '#1f7a4d';

export type MapMode = 'marker' | 'polygon' | 'multi';

export interface MapAddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface MapAddressDetails {
  formattedAddress: string;
  placeId: string;
  components: MapAddressComponent[];
}

export interface MapLocation {
  lat: number;
  lng: number;
  addressDetails: MapAddressDetails | null;
}

export interface MapPlaceSelection {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

export interface MapPolygonChange {
  geometry: ZonePolygon;
  areaSqKm: number;
}

export interface MapPolygonEvent {
  layerId: number;
  geometry: ZonePolygon;
  areaSqKm: number;
}

export interface MapOverlay {
  id: string;
  geometry: ZonePolygon;
  strokeColor: string;
  fillColor: string;
  fillOpacity: number;
  strokeWeight?: number;
}

interface DraftPolygon {
  layerId: number;
  polygon: google.maps.Polygon;
  color: string;
}

interface ResolvedPlace {
  lat: number;
  lng: number;
  placeId: string;
  name: string;
  formattedAddress: string;
}

interface SearchHit {
  id: string;
  label: string;
  resolve: () => Promise<ResolvedPlace | null>;
}

let mapsLoader: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }

  const withLibraries = () => {
    const importer = (window as Window & {
      google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
    }).google?.maps?.importLibrary;
    if (!importer) return Promise.resolve();
    return Promise.all([importer('maps'), importer('places')]).then(() => undefined);
  };

  const maps = (window as Window & { google?: { maps?: { importLibrary?: unknown } } }).google?.maps;
  if (maps?.importLibrary) return withLibraries();
  if (mapsLoader) return mapsLoader.then(() => withLibraries());

  mapsLoader = new Promise<void>((resolve, reject) => {
    const callbackName = 'comboMapsInit';
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      resolve();
    };
    const script = document.createElement('script');
    script.id = MAPS_SCRIPT_ID;
    script.async = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&language=ar&v=weekly&callback=${callbackName}`;
    script.onerror = () => {
      mapsLoader = null;
      reject(new Error('Failed to load the Google Maps JavaScript API.'));
    };
    document.head.appendChild(script);
  });

  return mapsLoader.then(() => withLibraries());
}

@Component({
  selector: 'combo-map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);

  readonly initialLat = input(DEFAULT_LAT);
  readonly initialLng = input(DEFAULT_LNG);
  readonly zoom = input(14);
  /** Marker mode: pin can be moved. Polygon modes follow `readOnly`. */
  readonly isEditable = input(true);
  readonly mode = input<MapMode>('marker');
  readonly readOnly = input(false);
  /** Single editable polygon for `mode="polygon"`. */
  readonly polygon = input<ZonePolygon | null>(null);
  readonly polygonColor = input(DEFAULT_POLYGON_COLOR);
  /** Read-only shapes: parent zones, siblings, hub boundaries, overlap. */
  readonly overlays = input<MapOverlay[]>([]);
  /** Multi mode: drawing tools stay off until the parent enables them. */
  readonly drawingEnabled = input(true);
  /** Marker mode: reject clicks and search results outside this polygon. */
  readonly constrainTo = input<ZonePolygon | null>(null);
  /**
   * Marker position owned by the parent.
   * `undefined` leaves the pin under map control. `null` hides it.
   */
  readonly pinLat = input<number | null | undefined>(undefined);
  readonly pinLng = input<number | null | undefined>(undefined);
  readonly blockedMessage = input('');
  readonly hint = input('');

  readonly locationSelected = output<MapLocation>();
  readonly locationRejected = output<void>();
  readonly searchPlaceSelected = output<MapPlaceSelection>();
  readonly polygonChanged = output<MapPolygonChange | null>();
  readonly polygonCreated = output<MapPolygonEvent>();
  readonly polygonUpdated = output<MapPolygonEvent>();
  readonly polygonRemoved = output<number>();

  readonly ready = signal(false);
  readonly hasPolygon = signal(false);
  /** Custom draw toolbar (Google DrawingManager was removed in Maps JS API 3.65+). */
  protected readonly showDrawToolbar = signal(false);
  protected readonly isDrawing = signal(false);
  protected readonly drawingVertexCount = signal(0);
  protected readonly searchQuery = signal('');
  protected readonly suggestions = signal<SearchHit[]>([]);
  protected readonly searchOpen = signal(false);
  protected readonly searchLoading = signal(false);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');

  protected loadError = '';

  private map: google.maps.Map | null = null;
  private marker: google.maps.Marker | null = null;
  private geocoder: google.maps.Geocoder | null = null;
  private editablePolygon: google.maps.Polygon | null = null;
  private drawPreview: google.maps.Polyline | null = null;
  private readonly drawVertexMarkers: google.maps.Marker[] = [];
  private drawingVertices: google.maps.LatLngLiteral[] = [];
  private readonly overlayPolygons: google.maps.Polygon[] = [];
  private readonly drafts = new Map<number, DraftPolygon>();
  private nextLayerId = 1;
  private drawColor = DEFAULT_POLYGON_COLOR;
  private destroyed = false;

  constructor() {
    effect(() => {
      if (!this.ready() || this.mode() !== 'polygon') return;
      const geometry = this.polygon();
      const readOnly = this.readOnly();
      const color = this.polygonColor();
      untracked(() => this.renderSinglePolygon(geometry, readOnly, color));
    });

    effect(() => {
      if (!this.ready()) return;
      const overlays = this.overlays();
      untracked(() => this.renderOverlays(overlays));
    });

    effect(() => {
      if (!this.ready() || this.mode() !== 'marker' || !this.marker) return;
      const lat = this.pinLat();
      const lng = this.pinLng();
      const editable = this.isEditable();
      untracked(() => this.syncMarker(lat, lng, editable));
    });

    effect(() => {
      if (!this.ready()) return;
      const mode = this.mode();
      const enabled = this.drawingEnabled();
      const readOnly = this.readOnly();
      const color = this.polygonColor();
      untracked(() => {
        this.drawColor = color;
        this.syncDrawToolbar(mode, enabled && !readOnly);
      });
    });
  }

  ngAfterViewInit(): void {
    void this.boot();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.editablePolygon?.setMap(null);
    for (const overlay of this.overlayPolygons) overlay.setMap(null);
    for (const draft of this.drafts.values()) draft.polygon.setMap(null);
    this.drafts.clear();
    this.marker?.setMap(null);
    this.clearDrawPreview();
    this.map = null;
  }

  startVertexDrawing(): void {
    if (!this.map || !this.showDrawToolbar()) return;
    this.isDrawing.set(true);
    this.drawingVertices = [];
    this.drawingVertexCount.set(0);
    this.clearDrawPreview();
    this.map.setOptions({ draggableCursor: 'crosshair', draggingCursor: 'crosshair' });
  }

  cancelVertexDrawing(): void {
    this.isDrawing.set(false);
    this.drawingVertices = [];
    this.drawingVertexCount.set(0);
    this.clearDrawPreview();
    this.map?.setOptions({ draggableCursor: undefined, draggingCursor: undefined });
  }

  finishVertexDrawing(): void {
    if (this.drawingVertices.length < 3 || !this.map) return;
    const polygon = new google.maps.Polygon({
      paths: [...this.drawingVertices],
      ...this.polygonOptions(this.drawColor),
      editable: true,
    });
    polygon.setMap(this.map);
    this.cancelVertexDrawing();
    this.onPolygonComplete(polygon);
  }

  /** Stored geometry added to the editable set. Used by the sub-zone editor. */
  addPolygon(geometry: ZonePolygon, color: string): MapPolygonEvent | null {
    const map = this.map;
    if (!map) return null;
    const polygon = this.createPolygon(geometry, color, true);
    polygon.setMap(map);
    const layerId = this.nextLayerId++;
    this.drafts.set(layerId, { layerId, polygon, color });
    this.watchDraft(layerId, polygon);
    this.drawColor = color;
    this.syncDrawToolbar(this.mode(), this.drawingEnabled() && !this.readOnly());
    const event = this.eventFrom(layerId, polygon);
    this.hasPolygon.set(this.drafts.size > 0);
    return event;
  }

  updateLayerColor(layerId: number, color: string): void {
    const draft = this.drafts.get(layerId);
    if (!draft) return;
    draft.color = color;
    draft.polygon.setOptions({ strokeColor: color, fillColor: color });
    this.drawColor = color;
    this.syncDrawToolbar(this.mode(), this.drawingEnabled() && !this.readOnly());
  }

  removeLayer(layerId: number): void {
    const draft = this.drafts.get(layerId);
    if (!draft) return;
    google.maps.event.clearInstanceListeners(draft.polygon);
    google.maps.event.clearInstanceListeners(draft.polygon.getPath());
    draft.polygon.setMap(null);
    this.drafts.delete(layerId);
    this.hasPolygon.set(this.drafts.size > 0);
  }

  clearDraftLayers(): void {
    for (const layerId of [...this.drafts.keys()]) this.removeLayer(layerId);
  }

  clearPolygon(): void {
    if (this.mode() === 'polygon') {
      this.removeEditable();
      this.zone.run(() => this.polygonChanged.emit(null));
      this.syncDrawToolbar('polygon', !this.readOnly());
      return;
    }
    this.clearDraftLayers();
  }

  private async boot(): Promise<void> {
    if (GOOGLE_MAPS_API_KEY.startsWith('YOUR_')) {
      this.loadError = 'أضف مفتاح Google Maps في GOOGLE_MAPS_API_KEY.';
      return;
    }

    try {
      await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
    } catch {
      if (!this.destroyed) this.loadError = 'تعذر تحميل خرائط Google.';
      return;
    }
    if (this.destroyed) return;

    const center = { lat: this.initialLat(), lng: this.initialLng() };
    this.geocoder = new google.maps.Geocoder();
    this.map = new google.maps.Map(this.mapEl().nativeElement, {
      center,
      zoom: this.zoom(),
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    const markerMode = this.mode() === 'marker';
    const showMarker = markerMode && this.pinLat() !== null && this.pinLng() !== null;
    this.marker = new google.maps.Marker({
      map: showMarker ? this.map : null,
      position: {
        lat: this.pinLat() ?? center.lat,
        lng: this.pinLng() ?? center.lng,
      },
      draggable: markerMode && this.isEditable(),
    });

    this.map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      if (this.isDrawing()) {
        this.addDrawingVertex(event.latLng.lat(), event.latLng.lng());
        return;
      }
      if (this.mode() !== 'marker' || !this.isEditable()) return;
      this.commitPoint(event.latLng.lat(), event.latLng.lng());
    });

    this.marker.addListener('dragend', () => {
      const position = this.marker?.getPosition();
      if (!position || this.mode() !== 'marker' || !this.isEditable()) return;
      this.commitPoint(position.lat(), position.lng(), false);
    });

    this.syncDrawToolbar(this.mode(), this.drawingEnabled() && !this.readOnly());
    this.ready.set(true);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);

    const query = value.trim();
    if (query.length < 2) {
      this.searchSeq += 1;
      this.suggestions.set([]);
      this.searchOpen.set(false);
      this.searchLoading.set(false);
      return;
    }

    this.searchLoading.set(true);
    this.searchTimer = setTimeout(() => void this.runSearch(query), 300);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = this.suggestions()[0];
    if (first) void this.selectHit(first);
  }

  onSearchFocus(): void {
    if (this.suggestions().length > 0) this.searchOpen.set(true);
  }

  onSearchFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const wrap = (event.currentTarget as HTMLElement | null);
    if (next && wrap?.contains(next)) return;
    this.searchOpen.set(false);
  }

  async selectHit(hit: SearchHit): Promise<void> {
    this.searchQuery.set(hit.label);
    this.searchOpen.set(false);
    this.suggestions.set([]);
    const place = await hit.resolve();
    if (!place || !this.map || this.destroyed) return;

    this.zone.run(() => {
      this.map?.panTo({ lat: place.lat, lng: place.lng });
      this.map?.setZoom(Math.max(this.zoom(), 16));
      this.searchPlaceSelected.emit({
        placeId: place.placeId,
        name: place.name,
        formattedAddress: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
      });
      if (this.mode() === 'marker') this.commitPoint(place.lat, place.lng);
    });
  }

  private async runSearch(query: string): Promise<void> {
    const seq = ++this.searchSeq;
    let hits: SearchHit[] = [];
    try {
      hits = await this.fetchPlaceSuggestions(query);
    } catch {
      hits = [];
    }
    if (hits.length === 0) {
      try {
        hits = await this.fetchGeocodeSuggestions(query);
      } catch {
        hits = [];
      }
    }
    if (seq !== this.searchSeq || this.destroyed) return;
    this.zone.run(() => {
      this.suggestions.set(hits);
      this.searchOpen.set(true);
      this.searchLoading.set(false);
    });
  }

  private async fetchPlaceSuggestions(query: string): Promise<SearchHit[]> {
    const suggestionApi = google.maps.places?.AutocompleteSuggestion;
    if (!suggestionApi) return [];

    const { suggestions } = await suggestionApi.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ['eg'],
      language: 'ar',
    });

    return suggestions.slice(0, 6).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) return [];
      const label = prediction.text.text || prediction.text.toString();
      return [{
        id: prediction.placeId,
        label,
        resolve: async () => {
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName', 'id'] });
          const location = place.location;
          if (!location) return null;
          const name = typeof place.displayName === 'string'
            ? place.displayName
            : place.displayName?.text || label;
          return {
            lat: location.lat(),
            lng: location.lng(),
            placeId: place.id || prediction.placeId,
            name: name || label,
            formattedAddress: place.formattedAddress || label,
          };
        },
      }];
    });
  }

  private fetchGeocodeSuggestions(query: string): Promise<SearchHit[]> {
    const geocoder = this.geocoder;
    if (!geocoder) return Promise.resolve([]);

    return new Promise((resolve) => {
      geocoder.geocode(
        { address: query, componentRestrictions: { country: 'eg' } },
        (results, status) => {
          if (status !== 'OK' || !results) {
            resolve([]);
            return;
          }
          resolve(
            results.slice(0, 6).map((result) => {
              const lat = result.geometry.location.lat();
              const lng = result.geometry.location.lng();
              return {
                id: result.place_id,
                label: result.formatted_address,
                resolve: async () => ({
                  lat,
                  lng,
                  placeId: result.place_id,
                  name: result.formatted_address,
                  formattedAddress: result.formatted_address,
                }),
              };
            }),
          );
        },
      );
    });
  }

  private commitPoint(lat: number, lng: number, moveMarker = true): void {
    if (!this.insideConstraint(lat, lng)) {
      if (!moveMarker) this.syncMarker(this.pinLat(), this.pinLng(), this.isEditable());
      this.zone.run(() => this.locationRejected.emit());
      return;
    }
    if (moveMarker) {
      this.marker?.setMap(this.map);
      this.marker?.setPosition({ lat, lng });
    }
    this.map?.panTo({ lat, lng });
    this.reverseGeocode(lat, lng);
  }

  private insideConstraint(lat: number, lng: number): boolean {
    const geometry = this.constrainTo();
    if (!geometry) return true;
    try {
      return turf.booleanPointInPolygon(turf.point([lng, lat]), turf.polygon(geometry.coordinates));
    } catch {
      return false;
    }
  }

  private syncMarker(lat: number | null | undefined, lng: number | null | undefined, editable: boolean): void {
    if (!this.marker || !this.map) return;
    this.marker.setDraggable(editable);
    if (lat === undefined || lng === undefined) return;
    if (lat == null || lng == null) {
      this.marker.setMap(null);
      return;
    }
    this.marker.setMap(this.map);
    this.marker.setPosition({ lat, lng });
  }

  private onPolygonComplete(polygon: google.maps.Polygon): void {
    if (this.mode() === 'polygon') {
      this.removeEditable();
      this.editablePolygon = polygon;
      polygon.setEditable(!this.readOnly());
      this.watchSingle(polygon);
      this.hasPolygon.set(true);
      this.emitSingle(polygon);
      this.syncDrawToolbar('polygon', !this.readOnly());
      return;
    }

    const layerId = this.nextLayerId++;
    polygon.setOptions(this.polygonOptions(this.drawColor));
    polygon.setEditable(true);
    this.drafts.set(layerId, { layerId, polygon, color: this.drawColor });
    this.watchDraft(layerId, polygon);
    this.hasPolygon.set(true);
    const event = this.eventFrom(layerId, polygon);
    this.zone.run(() => this.polygonCreated.emit(event));
  }

  private renderSinglePolygon(geometry: ZonePolygon | null, readOnly: boolean, color: string): void {
    if (!this.map) return;
    if (!geometry) {
      if (!this.editablePolygon) this.hasPolygon.set(false);
      return;
    }
    if (this.sameGeometry(this.editablePolygon, geometry)) {
      this.editablePolygon?.setEditable(!readOnly);
      return;
    }
    this.removeEditable();
    const polygon = this.createPolygon(geometry, color, !readOnly);
    polygon.setMap(this.map);
    this.editablePolygon = polygon;
    this.watchSingle(polygon);
    this.hasPolygon.set(true);
    this.fitTo([polygon]);
    this.syncDrawToolbar('polygon', !readOnly);
  }

  private renderOverlays(overlays: MapOverlay[]): void {
    for (const polygon of this.overlayPolygons) polygon.setMap(null);
    this.overlayPolygons.length = 0;
    const map = this.map;
    if (!map) return;

    for (const overlay of overlays) {
      const polygon = this.createPolygon(overlay.geometry, overlay.strokeColor, false);
      polygon.setOptions({
        fillColor: overlay.fillColor,
        fillOpacity: overlay.fillOpacity,
        strokeWeight: overlay.strokeWeight ?? 2,
        clickable: false,
        zIndex: 0,
      });
      polygon.setMap(map);
      this.overlayPolygons.push(polygon);
    }
    if (this.overlayPolygons.length > 0) this.fitTo(this.overlayPolygons);
  }

  private syncDrawToolbar(mode: MapMode, enabled: boolean): void {
    const show = enabled && (mode === 'multi' || (mode === 'polygon' && !this.editablePolygon));
    this.showDrawToolbar.set(show);
    if (!show) this.cancelVertexDrawing();
  }

  private addDrawingVertex(lat: number, lng: number): void {
    if (this.drawingVertices.length >= 3 && this.nearFirstVertex(lat, lng)) {
      this.finishVertexDrawing();
      return;
    }
    const isFirst = this.drawingVertices.length === 0;
    this.drawingVertices.push({ lat, lng });
    this.drawingVertexCount.set(this.drawingVertices.length);
    this.addDrawVertexMarker({ lat, lng }, this.drawingVertices.length - 1, isFirst);
    this.updateDrawPreview();
  }

  private nearFirstVertex(lat: number, lng: number): boolean {
    const first = this.drawingVertices[0];
    if (!first) return false;
    return Math.abs(lat - first.lat) < 0.00025 && Math.abs(lng - first.lng) < 0.00025;
  }

  private updateDrawPreview(): void {
    const map = this.map;
    if (!map || this.drawingVertices.length === 0) {
      this.clearDrawPreview();
      return;
    }
    const path = [...this.drawingVertices];
    if (path.length >= 3) path.push(path[0]);
    if (!this.drawPreview) {
      this.drawPreview = new google.maps.Polyline({
        map,
        path,
        strokeColor: this.drawColor,
        strokeWeight: 3,
        strokeOpacity: 0.95,
        clickable: false,
        zIndex: 2,
      });
      return;
    }
    this.drawPreview.setPath(path);
    this.drawPreview.setOptions({ strokeColor: this.drawColor });
  }

  private addDrawVertexMarker(
    position: google.maps.LatLngLiteral,
    index: number,
    isFirst: boolean,
  ): void {
    const map = this.map;
    if (!map) return;
    const marker = new google.maps.Marker({
      map,
      position,
      draggable: true,
      clickable: true,
      zIndex: 20,
      icon: this.drawVertexIcon(isFirst),
    });
    marker.addListener('dragend', () => {
      const dragged = marker.getPosition();
      if (!dragged || index >= this.drawingVertices.length) return;
      this.drawingVertices[index] = { lat: dragged.lat(), lng: dragged.lng() };
      this.updateDrawPreview();
    });
    this.drawVertexMarkers.push(marker);
  }

  private drawVertexIcon(isFirst: boolean): google.maps.Symbol {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: isFirst ? 11 : 8,
      fillColor: isFirst ? '#1f7a4d' : '#ffffff',
      fillOpacity: 1,
      strokeColor: isFirst ? '#ffffff' : this.drawColor,
      strokeWeight: isFirst ? 3 : 2.5,
    };
  }

  private clearDrawPreview(): void {
    this.drawPreview?.setMap(null);
    this.drawPreview = null;
    for (const vertexMarker of this.drawVertexMarkers) {
      google.maps.event.clearInstanceListeners(vertexMarker);
      vertexMarker.setMap(null);
    }
    this.drawVertexMarkers.length = 0;
  }

  private watchSingle(polygon: google.maps.Polygon): void {
    const sync = () => this.emitSingle(polygon);
    polygon.getPath().addListener('set_at', sync);
    polygon.getPath().addListener('insert_at', sync);
    polygon.getPath().addListener('remove_at', sync);
  }

  private watchDraft(layerId: number, polygon: google.maps.Polygon): void {
    const sync = () => {
      const event = this.eventFrom(layerId, polygon);
      this.zone.run(() => this.polygonUpdated.emit(event));
    };
    polygon.getPath().addListener('set_at', sync);
    polygon.getPath().addListener('insert_at', sync);
    polygon.getPath().addListener('remove_at', sync);
  }

  private emitSingle(polygon: google.maps.Polygon): void {
    const geometry = this.toGeometry(polygon);
    if (!geometry) return;
    const areaSqKm = this.areaOf(geometry);
    this.zone.run(() => this.polygonChanged.emit({ geometry, areaSqKm }));
  }

  private eventFrom(layerId: number, polygon: google.maps.Polygon): MapPolygonEvent {
    const geometry = this.toGeometry(polygon) ?? { type: 'Polygon', coordinates: [[]] };
    return { layerId, geometry, areaSqKm: this.areaOf(geometry) };
  }

  private removeEditable(): void {
    if (!this.editablePolygon) return;
    google.maps.event.clearInstanceListeners(this.editablePolygon);
    google.maps.event.clearInstanceListeners(this.editablePolygon.getPath());
    this.editablePolygon.setMap(null);
    this.editablePolygon = null;
    this.hasPolygon.set(false);
  }

  private createPolygon(geometry: ZonePolygon, color: string, editable: boolean): google.maps.Polygon {
    return new google.maps.Polygon({
      paths: this.toPath(geometry),
      ...this.polygonOptions(color),
      editable,
    });
  }

  private polygonOptions(color: string): google.maps.PolygonOptions {
    return {
      strokeColor: color,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.18,
      editable: true,
      draggable: false,
    };
  }

  private toPath(geometry: ZonePolygon): google.maps.LatLngLiteral[] {
    const ring = geometry.coordinates[0] ?? [];
    const points = ring.map(([lng, lat]) => ({ lat, lng }));
    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first.lat === last.lat && first.lng === last.lng) points.pop();
    }
    return points;
  }

  private toGeometry(polygon: google.maps.Polygon): ZonePolygon | null {
    const path = polygon.getPath();
    if (path.getLength() < 3) return null;
    const ring: number[][] = [];
    path.forEach((point) => ring.push([point.lng(), point.lat()]));
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    return { type: 'Polygon', coordinates: [ring] };
  }

  private sameGeometry(polygon: google.maps.Polygon | null, geometry: ZonePolygon): boolean {
    if (!polygon) return false;
    const current = this.toGeometry(polygon);
    if (!current) return false;
    return JSON.stringify(current.coordinates) === JSON.stringify(geometry.coordinates);
  }

  private areaOf(geometry: ZonePolygon): number {
    try {
      const areaSqKm = turf.area(turf.polygon(geometry.coordinates)) / 1_000_000;
      return Math.round(areaSqKm * 100) / 100;
    } catch {
      return 0;
    }
  }

  private fitTo(polygons: google.maps.Polygon[]): void {
    const map = this.map;
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    for (const polygon of polygons) {
      polygon.getPath().forEach((point) => bounds.extend(point));
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
  }

  private reverseGeocode(lat: number, lng: number): void {
    this.geocoder?.geocode({ location: { lat, lng } }, (results, status) => {
      const top = status === 'OK' ? results?.[0] : undefined;
      this.zone.run(() => {
        this.locationSelected.emit({
          lat,
          lng,
          addressDetails: top
            ? {
                formattedAddress: top.formatted_address,
                placeId: top.place_id,
                components: (top.address_components ?? []).map((component) => ({
                  longName: component.long_name,
                  shortName: component.short_name,
                  types: component.types,
                })),
              }
            : null,
        });
      });
    });
  }
}
