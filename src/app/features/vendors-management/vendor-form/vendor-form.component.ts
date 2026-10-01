import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import * as L from 'leaflet';
import * as turf from '@turf/turf';
import { HubService } from '../../../core/services/hub.service';
import { VendorCategoryService } from '../../../core/services/vendor-category.service';
import { VendorService } from '../../../core/services/vendor.service';
import { normalizeZonePolygon, type ZonePolygon, CAIRO_CENTER, DEFAULT_ZOOM } from '../../../core/models/zone.model';
import {
  LiveStatusOverride,
  SystemStatus,
  VendorLocation,
  VendorProfile,
} from '../data/vendors.mock';

const OUTSIDE_HUB_MESSAGE =
  'موقع المتجر يقع خارج حدود نقطة التجميع المحددة. الرجاء اختيار موقع صحيح.';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const HUB_PATH: L.PathOptions = {
  color: '#1f7a4d',
  fillColor: '#1f7a4d',
  fillOpacity: 0.1,
  weight: 2,
  interactive: false,
};

@Component({
  selector: 'ctrl-vendor-form',
  standalone: true,
  imports: [
    NgClass,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    ToggleSwitchModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './vendor-form.component.html',
  styleUrl: './vendor-form.component.scss',
})
export class VendorFormComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(VendorCategoryService);
  private readonly hubService = inject(HubService);
  private readonly vendorService = inject(VendorService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  private map?: L.Map;
  private hubLayer?: L.Polygon;
  private pin?: L.Marker;
  /** Hub id whose polygon is on the map. Used to ignore repeat dropdown emissions. */
  private drawnHubId: string | null = null;
  /** Polygon currently drawn for the selected hub. Null until a hub is chosen. */
  private hubGeometry: ZonePolygon | null = null;

  isEditMode = false;
  vendorId: string | null = null;

  /** Keeps an inactive assigned category visible while editing. */
  private readonly keptCategoryId = signal<string | null>(null);
  private readonly keptHubId = signal<string | null>(null);
  readonly mapWarning = signal<string | null>(null);

  readonly hubOptions = computed(() =>
    this.hubService.hubs()
      .filter((hub) => hub.isActive || hub.id === this.keptHubId())
      .map((hub) => ({
        label: hub.isActive ? hub.name : `${hub.name} (غير نشطة)`,
        value: hub.id,
      })),
  );

  /** Active categories, plus an inactive one kept visible while editing its vendor. */
  readonly categories = computed(() =>
    this.categoryService.categories()
      .filter((category) => category.isActive || category.id === this.keptCategoryId())
      .map((category) => ({
        id: category.id,
        name: category.isActive ? category.name : `${category.name} (غير نشطة)`,
      })),
  );

  readonly logoPreview = signal<string | null>(null);
  private logoObjectUrl: string | null = null;

  readonly overrideOptions = [
    { label: 'تلقائي', value: 'auto' as LiveStatusOverride },
    { label: 'فرض مشغول', value: 'force_busy' as LiveStatusOverride },
    { label: 'فرض مغلق', value: 'force_closed' as LiveStatusOverride },
  ];

  readonly vendorForm = this.fb.group({
    name:          ['', Validators.required],
    phone:         ['', Validators.required],
    contactPerson: ['', Validators.required],
    hubId:         ['', Validators.required],
    location:      this.fb.control<VendorLocation | null>(null, [
      Validators.required,
      (control) => this.locationInsideHub(control),
    ]),
    category:      ['', Validators.required],
    logoUrl:       [null as string | null],
    openingTime:   ['09:00'],
    closingTime:   ['23:00'],
    liveStatusOverride: ['auto' as LiveStatusOverride],
    minOrder:           [30, [Validators.required, Validators.min(0)]],
    systemStatus:       ['active' as SystemStatus],
    autoAccept:           [false],
  });

  ngOnInit(): void {
    this.vendorId   = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.vendorId;

    if (this.isEditMode && this.vendorId) {
      const existing = this.vendorService.getById(this.vendorId);
      if (existing) {
        this.keptCategoryId.set(existing.category);
        this.keptHubId.set(existing.hubId);
        this.patchFromVendor(existing);
      }
    }
  }

  ngAfterViewInit(): void {
    this.initMap();
    const hubId = this.vendorForm.controls.hubId.value;
    if (hubId) {
      this.drawHub(hubId);
      this.restorePinIfInside();
    }

    this.vendorForm.controls.hubId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((hubId) => this.onHubChanged(hubId));
  }

  ngOnDestroy(): void {
    this.revokeLogoObjectUrl();
    this.pin?.remove();
    this.hubLayer?.remove();
    this.map?.off();
    this.map?.remove();
    this.map = undefined;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) {
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.messages.add({
        severity: 'warn',
        summary: 'حجم الصورة كبير',
        detail: 'الحد الأقصى لشعار المتجر هو 2 ميجا.',
        life: 5000,
      });
      return;
    }

    this.revokeLogoObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    this.logoObjectUrl = previewUrl;
    this.logoPreview.set(previewUrl);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      this.vendorForm.patchValue({ logoUrl: dataUrl });
      this.vendorForm.get('logoUrl')?.markAsDirty();
    };
    reader.readAsDataURL(file);
  }

  save(): void {
    const location = this.vendorForm.get('location')?.value ?? null;
    if (location == null || this.vendorForm.invalid || !this.pointInsideHub(location)) {
      this.vendorForm.markAllAsTouched();
      if (location && !this.pointInsideHub(location)) {
        this.rejectOutsideClick();
      }
      return;
    }

    const raw = this.vendorForm.getRawValue();
    const hubId = raw.hubId!;

    if (this.isEditMode && this.vendorId) {
      const current = this.vendorService.getById(this.vendorId);
      if (current) {
        this.vendorService.update(this.vendorId, {
          name:          raw.name!,
          phone:         raw.phone!,
          contactPerson: raw.contactPerson!,
          hubId,
          location,
          category:      raw.category as VendorProfile['category'],
          liveStatusOverride: raw.liveStatusOverride!,
          minOrder:           raw.minOrder ?? 0,
          systemStatus:       raw.systemStatus!,
          ...(raw.logoUrl ? { logoUrl: raw.logoUrl } : {}),
          settings: {
            ...current.settings,
            openingTime: raw.openingTime || '09:00',
            closingTime: raw.closingTime || '23:00',
            autoAccept:  raw.autoAccept ?? false,
          },
        });
      }
      this.router.navigate(['/vendors', this.vendorId]);
    } else {
      this.vendorService.add({
        name:          raw.name!,
        phone:         raw.phone!,
        contactPerson: raw.contactPerson!,
        hubId,
        location,
        category:      raw.category as VendorProfile['category'],
        systemStatus:  raw.systemStatus!,
        liveStatusOverride: raw.liveStatusOverride!,
        liveStatus:    'closed',
        ...(raw.logoUrl ? { logoUrl: raw.logoUrl } : {}),
        settings: {
          openingTime: raw.openingTime || '09:00',
          closingTime: raw.closingTime || '23:00',
          autoAccept:  raw.autoAccept ?? false,
        },
        minOrder:        raw.minOrder ?? 0,
        discountPercent: 0,
        commissionRate:  10,
        walletBalance:   0,
        stats: { rating: 0, totalReviews: 0, totalCompletedOrders: 0 },
      });
      this.router.navigate(['/vendors']);
    }
  }

  cancel(): void {
    this.router.navigate(['/vendors']);
  }

  private patchFromVendor(vendor: VendorProfile): void {
    this.vendorForm.patchValue({
      name:          vendor.name,
      phone:         vendor.phone,
      contactPerson: vendor.contactPerson,
      hubId:         vendor.hubId,
      location:      vendor.location,
      category:      vendor.category,
      logoUrl:       vendor.logoUrl ?? null,
      openingTime:   vendor.settings.openingTime,
      closingTime:   vendor.settings.closingTime,
      liveStatusOverride: vendor.liveStatusOverride,
      minOrder:           vendor.minOrder,
      systemStatus:       vendor.systemStatus,
      autoAccept:         vendor.settings.autoAccept,
    });
    this.logoPreview.set(vendor.logoUrl ?? null);
  }

  private revokeLogoObjectUrl(): void {
    if (this.logoObjectUrl) {
      URL.revokeObjectURL(this.logoObjectUrl);
      this.logoObjectUrl = null;
    }
  }

  private initMap(): void {
    const container = this.mapEl()?.nativeElement;
    if (!container || this.map) {
      return;
    }

    const map = L.map(container, {
      center: CAIRO_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      this.zone.run(() => this.onMapClick(event));
    });
    this.map = map;
    setTimeout(() => map.invalidateSize(), 0);
  }

  /** Changing the hub drops the previous pin. The new street must be pinned again. */
  private onHubChanged(hubId: string | null): void {
    if (hubId === this.drawnHubId) {
      return;
    }
    this.removePin();
    this.mapWarning.set(null);
    this.vendorForm.controls.location.setValue(null);
    this.vendorForm.controls.location.markAsTouched();

    if (!hubId) {
      this.drawnHubId = null;
      this.clearHubLayer();
      return;
    }
    this.drawHub(hubId);
  }

  private drawHub(hubId: string): void {
    this.drawnHubId = hubId;
    const hub = this.hubService.getById(hubId);
    const geometry = hub ? normalizeZonePolygon(hub.geometry) : null;
    this.clearHubLayer();
    this.hubGeometry = geometry;
    this.vendorForm.controls.location.updateValueAndValidity();

    const map = this.map;
    if (!map || !geometry) {
      return;
    }

    const ring = geometry.coordinates[0].map(([lng, lat]) => L.latLng(lat, lng));
    if (ring.length > 1 && ring[0].equals(ring[ring.length - 1])) {
      ring.pop();
    }
    if (ring.length < 3) {
      return;
    }

    const polygon = L.polygon(ring, HUB_PATH).addTo(map);
    this.hubLayer = polygon;
    if (polygon.getBounds().isValid()) {
      map.fitBounds(polygon.getBounds(), { padding: [48, 48], maxZoom: 18 });
    }
    setTimeout(() => map.invalidateSize(), 0);
  }

  private onMapClick(event: L.LeafletMouseEvent): void {
    if (!this.hubGeometry) {
      return;
    }

    const location: VendorLocation = {
      lat: event.latlng.lat,
      lng: event.latlng.lng,
    };
    if (!this.pointInsideHub(location)) {
      this.rejectOutsideClick();
      return;
    }

    this.placePin(location);
    this.mapWarning.set(null);
    const { lat, lng } = location;
    this.vendorForm.patchValue({ location: { lat, lng } });
    this.vendorForm.get('location')?.markAsDirty();
  }

  private rejectOutsideClick(): void {
    if (this.vendorForm.controls.location.invalid) {
      this.mapWarning.set(OUTSIDE_HUB_MESSAGE);
    }
    this.messages.add({
      severity: 'warn',
      summary: 'موقع غير صالح',
      detail: OUTSIDE_HUB_MESSAGE,
      life: 5000,
    });
  }

  private restorePinIfInside(): void {
    const location = this.vendorForm.controls.location.value;
    if (!location || !this.pointInsideHub(location)) {
      this.vendorForm.controls.location.setValue(null);
      return;
    }
    this.placePin(location);
  }

  private placePin(location: VendorLocation): void {
    const map = this.map;
    if (!map) {
      return;
    }
    this.removePin();
    this.pin = L.marker([location.lat, location.lng], {
      icon: L.divIcon({
        className: 'vendor-form__pin',
        html: '<span class="vendor-form__pin-dot"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      keyboard: false,
      interactive: false,
    }).addTo(map);
  }

  private removePin(): void {
    this.pin?.remove();
    this.pin = undefined;
  }

  private clearHubLayer(): void {
    this.hubLayer?.remove();
    this.hubLayer = undefined;
    this.hubGeometry = null;
  }

  private locationInsideHub(control: AbstractControl): ValidationErrors | null {
    const value = control.value as VendorLocation | null;
    if (!value) {
      return null;
    }
    return this.pointInsideHub(value) ? null : { outsideHub: true };
  }

  private pointInsideHub(location: VendorLocation): boolean {
    const geometry = this.hubGeometry;
    if (!geometry) {
      return false;
    }
    try {
      return turf.booleanPointInPolygon(
        turf.point([location.lng, location.lat]),
        turf.polygon(geometry.coordinates),
      );
    } catch {
      return false;
    }
  }
}
