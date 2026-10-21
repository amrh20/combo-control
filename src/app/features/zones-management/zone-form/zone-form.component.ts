import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { GeometryInvalidError, GeometryOverlapError } from '../../../core/models/geometry-error';
import { ZoneService } from '../../../core/services/zone.service';
import {
  normalizeZonePolygon,
  type ZonePolygon,
  type ZoneWritePayload,
} from '../../../core/models/zone.model';
import { MapComponent, type MapPolygonChange } from '../../../shared/components/map/map.component';

@Component({
  selector: 'ctrl-zone-builder',
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
    InputTextModule,
    ToastModule,
    ToggleSwitchModule,
    MapComponent,
  ],
  providers: [MessageService],
  templateUrl: './zone-form.component.html',
  styleUrl: './zone-form.component.scss',
})
export class ZoneFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zoneService = inject(ZoneService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);

  readonly zoneId = signal<string | null>(null);
  readonly loading = signal(this.route.snapshot.paramMap.has('id'));
  readonly saving = signal(false);
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
    isActive: [true],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.zoneId.set(id);
    if (!id) {
      return;
    }

    this.zoneService
      .getZoneById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (existing) => {
          this.form.patchValue({
            name: existing.name,
            isActive: existing.isActive,
          });
          this.initialGeometry.set(existing.polygon);
          this.zoneGeometry.set(existing.polygon);
          this.loading.set(false);
        },
        error: () => {
          this.missing.set(true);
          this.loading.set(false);
        },
      });
  }

  onPolygonChanged(change: MapPolygonChange | null): void {
    this.zoneGeometry.set(change?.geometry ?? null);
    this.areaSqKm.set(change?.areaSqKm ?? null);
    if (this.currentPolygonGeoJSON()) {
      this.geometryError.set(false);
    }
  }

  invalid(field: 'name'): boolean {
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
    const request = id
      ? this.zoneService.updateZone(id, zonePayload)
      : this.zoneService.createZone(zonePayload);

    this.saving.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.router.navigate(['/zones']),
      error: (error: unknown) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'تعذر الحفظ',
          detail: saveErrorDetail(error, 'تعذر حفظ المنطقة.'),
          life: 6000,
        });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/zones']);
  }
}

function saveErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof GeometryInvalidError) {
    return error.message;
  }
  if (error instanceof GeometryOverlapError) {
    return 'الرسمة تتداخل مع منطقة أخرى.';
  }
  return fallback;
}
