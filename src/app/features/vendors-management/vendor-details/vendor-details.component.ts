import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { HubService } from '../../../core/services/hub.service';
import { categoryIconSrc, VendorCategoryService } from '../../../core/services/vendor-category.service';
import { VendorService, vendorErrorMessage } from '../../../core/services/vendor.service';
import {
  getEffectiveLiveStatus,
  getVendorInitials,
  LIVE_OVERRIDE_CONFIG,
  LIVE_STATUS_CONFIG,
  VendorProfile,
} from '../data/vendors.mock';

@Component({
  selector: 'ctrl-vendor-details',
  standalone: true,
  imports: [NgClass, DecimalPipe, StatCardComponent],
  templateUrl: './vendor-details.component.html',
  styleUrl: './vendor-details.component.scss',
})
export class VendorDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(VendorCategoryService);
  private readonly hubService = inject(HubService);
  private readonly vendorService = inject(VendorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly liveStatusConfig = LIVE_STATUS_CONFIG;
  readonly liveOverrideConfig = LIVE_OVERRIDE_CONFIG;

  private readonly vendorSignal = signal<VendorProfile | null>(null);
  readonly vendor = this.vendorSignal.asReadonly();

  readonly liveStatus = computed(() => {
    const v = this.vendor();
    return v ? getEffectiveLiveStatus(v) : 'closed';
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/vendors']);
      return;
    }
    this.loadVendor(id);
  }

  getInitials(name: string): string {
    return getVendorInitials(name);
  }

  categoryName(categoryId: string): string {
    return this.categoryService.nameOf(categoryId) || '—';
  }

  hubName(hubId: string): string {
    return this.hubService.nameOf(hubId) || '—';
  }

  logoSrc(url: string): string {
    return categoryIconSrc(url);
  }

  ratingLabel(score: number | null): string {
    if (score === null || Number.isNaN(score)) {
      return 'لا يوجد';
    }
    return score.toFixed(2);
  }

  goBack(): void {
    this.router.navigate(['/vendors']);
  }

  private loadVendor(id: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.vendorService
      .getVendorById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (found) => {
          this.loading.set(false);
          this.vendorSignal.set(structuredClone(found));
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.vendorSignal.set(null);
          this.loadError.set(vendorErrorMessage(error, 'تعذر تحميل المتجر.'));
        },
      });
  }
}
