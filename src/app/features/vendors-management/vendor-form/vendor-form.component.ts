import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
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
import * as turf from '@turf/turf';
import { Subject, finalize, takeUntil } from 'rxjs';
import { VendorLiveStatusOverride, percentToBasisPoints } from '../../../core/models/vendor.model';
import { egpToPiastres, normalizeZonePolygon, type ZonePolygon } from '../../../core/models/zone.model';
import { MapComponent, type MapLocation, type MapOverlay } from '../../../shared/components/map/map.component';
import { HubService } from '../../../core/services/hub.service';
import { UploadService } from '../../../core/services/upload.service';
import {
  VendorCategoryService,
  categoryIconSrc,
} from '../../../core/services/vendor-category.service';
import {
  VendorService,
  toApiLiveStatusOverride,
  vendorErrorMessage,
} from '../../../core/services/vendor.service';
import { VendorProfile } from '../data/vendors.mock';

const OUTSIDE_HUB_MESSAGE =
  'موقع المتجر يقع خارج حدود نقطة التجميع المحددة. الرجاء اختيار موقع صحيح.';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface PinPoint {
  lat: number;
  lng: number;
}

@Component({
  selector: 'ctrl-vendor-form',
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    ToggleSwitchModule,
    ToastModule,
    MapComponent,
  ],
  providers: [MessageService],
  templateUrl: './vendor-form.component.html',
  styleUrl: './vendor-form.component.scss',
})
export class VendorFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(VendorCategoryService);
  private readonly hubService = inject(HubService);
  private readonly vendorService = inject(VendorService);
  private readonly uploadService = inject(UploadService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uploadStop$ = new Subject<void>();
  private uploadSeq = 0;

  /** Hub id whose polygon is on the map. Used to ignore repeat dropdown emissions. */
  private drawnHubId: string | null = null;
  /** Polygon currently drawn for the selected hub. Null until a hub is chosen. */
  readonly hubGeometry = signal<ZonePolygon | null>(null);
  readonly pin = signal<PinPoint | null>(null);
  readonly mapOverlays = computed<MapOverlay[]>(() => {
    const geometry = this.hubGeometry();
    if (!geometry) return [];
    return [{
      id: 'hub',
      geometry,
      strokeColor: '#1f7a4d',
      fillColor: '#1f7a4d',
      fillOpacity: 0.12,
    }];
  });

  isEditMode = false;
  vendorId: string | null = null;

  /** Keeps an inactive assigned category visible while editing. */
  private readonly keptCategoryId = signal<string | null>(null);
  private readonly keptHubId = signal<string | null>(null);
  readonly mapWarning = signal<string | null>(null);
  readonly optionsError = signal<string | null>(null);
  readonly logoError = signal<string | null>(null);
  readonly isUploading = signal(false);
  readonly saving = signal(false);
  readonly loadingVendor = signal(false);
  readonly logoPreview = signal<string | null>(null);

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
        label: category.isActive ? category.name : `${category.name} (غير نشطة)`,
        value: category.id,
      })),
  );

  readonly overrideOptions: { label: string; value: VendorLiveStatusOverride }[] = [
    { label: 'تلقائي', value: 'AUTO' },
    { label: 'فرض مشغول', value: 'FORCE_BUSY' },
    { label: 'فرض مغلق', value: 'FORCE_CLOSED' },
  ];

  readonly vendorForm = this.fb.group({
    name:          ['', Validators.required],
    phone:         ['', Validators.required],
    contactPerson: ['', Validators.required],
    categoryId:    ['', Validators.required],
    hubId:         ['', Validators.required],
    logoUrl:       [''],
    lat:           this.fb.control<number | null>(null, Validators.required),
    lng:           this.fb.control<number | null>(null, Validators.required),
    minOrder:      [30, [Validators.required, Validators.min(0)]],
    discountPercent:   [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    commissionPercent: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
    opens:         ['09:00', Validators.required],
    closes:        ['23:00', Validators.required],
    isActive:      [true],
    autoAccept:    [false],
    liveStatusOverride: ['AUTO' as VendorLiveStatusOverride],
  }, {
    validators: (control) => this.coordsInsideHub(control),
  });

  ngOnInit(): void {
    this.vendorId   = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.vendorId;

    if (this.isEditMode && this.vendorId) {
      this.loadVendor(this.vendorId);
    }

    this.vendorService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.optionsError.set('تعذر تحميل فئات المتاجر.'),
      });

    this.vendorService
      .getHubs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const hubId = this.vendorForm.controls.hubId.value;
          if (hubId) {
            this.drawHub(hubId);
            this.restorePinIfInside();
          }
        },
        error: () => this.optionsError.set('تعذر تحميل نقاط التجميع.'),
      });

    this.vendorForm.controls.hubId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((hubId) => this.onHubChanged(hubId));
  }

  ngOnDestroy(): void {
    this.uploadSeq += 1;
    this.uploadStop$.next();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || this.isUploading()) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.logoError.set('صيغة الصورة غير مدعومة. استخدم ملف صورة.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.logoError.set('الحد الأقصى لشعار المتجر هو 2 ميجا.');
      return;
    }

    const seq = ++this.uploadSeq;
    this.logoError.set(null);
    this.isUploading.set(true);
    this.uploadService
      .uploadImage(file)
      .pipe(
        takeUntil(this.uploadStop$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.uploadSeq === seq) {
            this.isUploading.set(false);
          }
        }),
      )
      .subscribe({
        next: (response) => {
          this.vendorForm.patchValue({ logoUrl: response.url });
          this.vendorForm.controls.logoUrl.markAsDirty();
          this.logoPreview.set(categoryIconSrc(response.url));
          this.logoError.set(null);
        },
        error: () => {
          this.logoError.set('تعذّر رفع الشعار. حاول مرة أخرى.');
        },
      });
  }

  clearLogo(input: HTMLInputElement): void {
    input.value = '';
    this.vendorForm.controls.logoUrl.setValue('');
    this.logoPreview.set(null);
    this.logoError.set(null);
  }

  save(): void {
    const lat = this.vendorForm.controls.lat.value;
    const lng = this.vendorForm.controls.lng.value;
    const inside = lat != null && lng != null && this.pointInsideHub({ lat, lng });
    if (
      lat == null ||
      lng == null ||
      this.vendorForm.invalid ||
      !inside ||
      this.saving() ||
      this.isUploading() ||
      this.loadingVendor()
    ) {
      this.vendorForm.markAllAsTouched();
      if (lat != null && lng != null && !inside) {
        this.rejectOutsideClick();
      }
      return;
    }

    const raw = this.vendorForm.getRawValue();
    const hubId = raw.hubId!;
    const opens = clock(raw.opens);
    const closes = clock(raw.closes);

    const payload = {
      name: raw.name!.trim(),
      phone: raw.phone!.trim(),
      contactPerson: raw.contactPerson!.trim(),
      categoryId: raw.categoryId!,
      hubId,
      location: { lat, lng },
      logoUrl: raw.logoUrl ?? '',
      isActive: raw.isActive ?? true,
      liveStatusOverride: raw.liveStatusOverride ?? 'AUTO',
      autoAccept: raw.autoAccept ?? false,
      minOrderPiastres: egpToPiastres(raw.minOrder ?? 0),
      discountBp: percentToBasisPoints(raw.discountPercent ?? 0),
      commissionBp: percentToBasisPoints(raw.commissionPercent ?? 0),
      hours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        opens,
        closes,
      })),
    };

    const vendorId = this.vendorId;
    this.saving.set(true);
    const request =
      this.isEditMode && vendorId
        ? this.vendorService.updateVendor(vendorId, payload)
        : this.vendorService.createVendor(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(this.isEditMode && vendorId ? ['/vendors', vendorId] : ['/vendors']);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'تعذر الحفظ',
          detail: vendorErrorMessage(
            error,
            this.isEditMode ? 'تعذر تعديل المتجر.' : 'تعذر إضافة المتجر.',
          ),
          life: 6000,
        });
      },
    });
  }

  private loadVendor(id: string): void {
    this.loadingVendor.set(true);
    this.vendorService
      .getVendorById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vendor) => {
          this.loadingVendor.set(false);
          this.keptCategoryId.set(vendor.category);
          this.keptHubId.set(vendor.hubId);
          this.drawnHubId = vendor.hubId;
          this.patchFromVendor(vendor);
          if (vendor.hubId) {
            this.drawHub(vendor.hubId);
            this.restorePinIfInside();
          }
        },
        error: (error: unknown) => {
          this.loadingVendor.set(false);
          this.optionsError.set(vendorErrorMessage(error, 'تعذر تحميل المتجر.'));
        },
      });
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
      categoryId:    vendor.category,
      lat:           vendor.location.lat,
      lng:           vendor.location.lng,
      logoUrl:       vendor.logoUrl ?? '',
      opens:         vendor.settings.openingTime,
      closes:        vendor.settings.closingTime,
      liveStatusOverride: toApiLiveStatusOverride(vendor.liveStatusOverride),
      minOrder:           vendor.minOrder,
      discountPercent:    vendor.discountPercent,
      commissionPercent:  vendor.commissionRate,
      isActive:           vendor.systemStatus === 'active',
      autoAccept:         vendor.settings.autoAccept,
    });
    this.logoPreview.set(vendor.logoUrl ? categoryIconSrc(vendor.logoUrl) : null);
  }

  onLocationSelected(location: MapLocation): void {
    this.pin.set({ lat: location.lat, lng: location.lng });
    this.mapWarning.set(null);
    this.vendorForm.patchValue({ lat: location.lat, lng: location.lng });
    this.vendorForm.controls.lat.markAsDirty();
    this.vendorForm.controls.lng.markAsDirty();
    this.vendorForm.updateValueAndValidity();
  }

  /** Changing the hub drops the previous pin. The new street must be pinned again. */
  private onHubChanged(hubId: string | null): void {
    if (hubId === this.drawnHubId) {
      return;
    }
    this.pin.set(null);
    this.mapWarning.set(null);
    this.vendorForm.patchValue({ lat: null, lng: null });
    this.vendorForm.controls.lat.markAsTouched();
    this.vendorForm.controls.lng.markAsTouched();

    if (!hubId) {
      this.drawnHubId = null;
      this.hubGeometry.set(null);
      this.vendorForm.updateValueAndValidity();
      return;
    }
    this.drawHub(hubId);
  }

  private drawHub(hubId: string): void {
    this.drawnHubId = hubId;
    const hub = this.hubService.getById(hubId);
    this.hubGeometry.set(hub ? normalizeZonePolygon(hub.geometry) : null);
    this.vendorForm.updateValueAndValidity();
  }

  rejectOutsideClick(): void {
    this.mapWarning.set(OUTSIDE_HUB_MESSAGE);
    this.messages.add({
      severity: 'warn',
      summary: 'موقع غير صالح',
      detail: OUTSIDE_HUB_MESSAGE,
      life: 5000,
    });
  }

  private restorePinIfInside(): void {
    const lat = this.vendorForm.controls.lat.value;
    const lng = this.vendorForm.controls.lng.value;
    if (lat == null || lng == null || !this.hubGeometry()) {
      return;
    }
    if (!this.pointInsideHub({ lat, lng })) {
      this.vendorForm.patchValue({ lat: null, lng: null });
      this.pin.set(null);
      return;
    }
    this.pin.set({ lat, lng });
  }

  private coordsInsideHub(control: AbstractControl): ValidationErrors | null {
    const lat = control.get('lat')?.value as number | null;
    const lng = control.get('lng')?.value as number | null;
    if (lat == null || lng == null) {
      return null;
    }
    return this.pointInsideHub({ lat, lng }) ? null : { outsideHub: true };
  }

  private pointInsideHub(location: PinPoint): boolean {
    const geometry = this.hubGeometry();
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

/** `<input type="time">` may include seconds. The API wants `HH:mm`. */
function clock(value: string | null): string {
  const match = (value ?? '').trim().match(/^(\d{2}:\d{2})/);
  return match?.[1] ?? (value ?? '').trim();
}
