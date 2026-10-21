/** Minimal Google Maps typings used by MapComponent. */
declare namespace google.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  class LatLngBounds {
    constructor();
    extend(point: LatLng | LatLngLiteral): void;
    isEmpty(): boolean;
  }

  class MVCArray<T> {
    getLength(): number;
    getAt(index: number): T;
    forEach(callback: (item: T) => void): void;
    addListener(event: string, handler: () => void): MapsEventListener;
  }

  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
    setCenter(center: LatLngLiteral): void;
    setZoom(zoom: number): void;
    setOptions(opts: MapOptions): void;
    panTo(center: LatLngLiteral): void;
    fitBounds(bounds: LatLngBounds, padding?: number): void;
    addListener(event: string, handler: (event: MapMouseEvent) => void): MapsEventListener;
  }

  interface MapOptions {
    center?: LatLngLiteral;
    zoom?: number;
    disableDefaultUI?: boolean;
    clickableIcons?: boolean;
    mapTypeControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    draggable?: boolean;
    gestureHandling?: string;
    draggableCursor?: string | null;
    draggingCursor?: string | null;
  }

  interface MapMouseEvent {
    latLng: LatLng | null;
  }

  interface MapsEventListener {
    remove(): void;
  }

  class Marker {
    constructor(opts?: MarkerOptions);
    setPosition(position: LatLngLiteral): void;
    setDraggable(draggable: boolean): void;
    getPosition(): LatLng | null | undefined;
    setMap(map: Map | null): void;
    addListener(event: string, handler: () => void): MapsEventListener;
  }

  enum SymbolPath {
    CIRCLE = 0,
  }

  interface Symbol {
    path?: SymbolPath | string;
    scale?: number;
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
  }

  interface MarkerOptions {
    map?: Map | null;
    position?: LatLngLiteral;
    draggable?: boolean;
    clickable?: boolean;
    zIndex?: number;
    icon?: Symbol | string;
  }

  class Polygon {
    constructor(opts?: PolygonOptions);
    setMap(map: Map | null): void;
    setOptions(opts: PolygonOptions): void;
    setEditable(editable: boolean): void;
    getPath(): MVCArray<LatLng>;
  }

  class Polyline {
    constructor(opts?: PolylineOptions);
    setMap(map: Map | null): void;
    setPath(path: LatLngLiteral[]): void;
    setOptions(opts: PolylineOptions): void;
  }

  interface PolylineOptions {
    map?: Map | null;
    path?: LatLngLiteral[];
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
    clickable?: boolean;
    zIndex?: number;
  }

  interface PolygonOptions {
    map?: Map | null;
    paths?: LatLngLiteral[];
    strokeColor?: string;
    strokeWeight?: number;
    fillColor?: string;
    fillOpacity?: number;
    editable?: boolean;
    draggable?: boolean;
    clickable?: boolean;
    zIndex?: number;
  }

  class Geocoder {
    geocode(
      request: {
        location?: LatLngLiteral;
        address?: string;
        componentRestrictions?: { country: string };
      },
      callback: (results: GeocoderResult[] | null, status: string) => void,
    ): void;
  }

  interface GeocoderResult {
    formatted_address: string;
    place_id: string;
    geometry: { location: LatLng };
    address_components?: GeocoderAddressComponent[];
  }

  interface GeocoderAddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
  }

  function importLibrary(name: string): Promise<unknown>;

  const ControlPosition: {
    TOP_LEFT: number;
    TOP_RIGHT: number;
  };

  namespace event {
    function clearInstanceListeners(instance: object): void;
  }

  namespace places {
    class AutocompleteSuggestion {
      static fetchAutocompleteSuggestions(request: {
        input: string;
        includedRegionCodes?: string[];
        language?: string;
      }): Promise<{ suggestions: PlaceSuggestion[] }>;
    }

    interface PlaceSuggestion {
      placePrediction?: {
        placeId: string;
        text: { text?: string; toString(): string };
        toPlace(): Place;
      };
    }

    interface Place {
      id?: string;
      formattedAddress?: string;
      displayName?: string | { text?: string };
      location?: LatLng;
      fetchFields(request: { fields: string[] }): Promise<void>;
    }
  }

  namespace drawing {
    class DrawingManager {
      constructor(opts?: DrawingManagerOptions);
      setMap(map: Map | null): void;
      setOptions(opts: DrawingManagerOptions): void;
      setDrawingMode(mode: OverlayType | null): void;
      addListener(event: string, handler: (polygon: Polygon) => void): MapsEventListener;
    }

    interface DrawingManagerOptions {
      map?: Map | null;
      drawingMode?: OverlayType | null;
      drawingControl?: boolean;
      drawingControlOptions?: {
        position?: number;
        drawingModes?: OverlayType[];
      };
      polygonOptions?: PolygonOptions;
    }

    const OverlayType: {
      POLYGON: OverlayType;
    };

    type OverlayType = string;
  }
}
