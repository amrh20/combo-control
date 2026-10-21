import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { Hub } from '../../../core/models/hub.model';
import {
  VendorApiLiveStatus,
  VendorListItem,
  isVendorLiveStatus,
} from '../../../core/models/vendor.model';
import { AuthService } from '../../../core/services/auth.service';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import {
  VendorCategory,
  categoryIconSrc,
  categoryTextColor,
  isCategoryIconImage,
} from '../../../core/services/vendor-category.service';
import { VendorService, vendorErrorMessage } from '../../../core/services/vendor.service';
import { getVendorInitials } from '../data/vendors.mock';

const PAGE_SIZE = 20;

interface VendorFilters {
  search: string;
  categoryId: string;
  hubId: string;
  liveStatus: string;
}

interface CategoryVisual {
  name: string;
  backgroundColor: string;
  icon: string;
}

@Component({
  selector: 'ctrl-vendors-list',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    SelectModule,
    ToggleSwitchModule,
    PermissionDirective,
    ComboInputComponent,
  ],
  templateUrl: './vendors-list.component.html',
  styleUrl: './vendors-list.component.scss',
})
export class VendorsListComponent {
  readonly auth = inject(AuthService);
  private readonly vendorService = inject(VendorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly loads = new Subject<void>();
  /** Rendered in the top layer so the table scroller cannot clip it. */
  private readonly actionsMenu = viewChild<ElementRef<HTMLElement>>('actionsMenu');

  readonly actionsVendor = signal<VendorListItem | null>(null);

  readonly filterForm = this.fb.nonNullable.group({
    search: '',
    categoryId: 'all',
    hubId: 'all',
    liveStatus: 'all',
  });

  readonly items = signal<VendorListItem[]>([]);
  /** Cursor that loaded the current page. Null on the first page. */
  readonly cursor = signal<string | null>(null);
  readonly nextCursor = signal<string | null>(null);
  /** Cursors of earlier pages, so Back can return to the first page. */
  readonly backStack = signal<(string | null)[]>([]);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pendingId = signal<string | null>(null);
  /** The vendors API rejects a search shorter than 2 characters. */
  readonly searchTooShort = signal(false);
  private readonly loadedCategories = signal<VendorCategory[]>([]);
  private readonly loadedHubs = signal<Hub[]>([]);
  /** Last filters actually sent, so a one-character search does not refetch. */
  private lastQuery = normalizeFilters(this.filterForm.getRawValue());

  readonly pageNumber = computed(() => this.backStack().length + 1);

  readonly categoryFilterOptions = computed(() => [
    { label: 'كل الفئات', value: 'all' },
    ...this.loadedCategories().map((category) => ({
      label: category.isActive ? category.name : `${category.name} (غير نشطة)`,
      value: category.id,
    })),
  ]);

  readonly hubFilterOptions = computed(() => [
    { label: 'كل نقاط التجميع', value: 'all' as const },
    ...this.loadedHubs().map((hub) => ({
      label: hub.isActive ? hub.name : `${hub.name} (غير نشطة)`,
      value: hub.id,
    })),
  ]);

  readonly liveStatusFilterOptions = [
    { label: 'كل الحالات المباشرة', value: 'all' },
    { label: 'مفتوح', value: 'OPEN' as const },
    { label: 'مشغول حالياً', value: 'BUSY' as const },
    { label: 'مغلق الآن', value: 'CLOSED' as const },
  ];

  constructor() {
    const closeMenuOnScroll = () => {
      const panel = this.actionsMenu()?.nativeElement;
      if (panel?.matches(':popover-open')) {
        panel.hidePopover();
      }
    };
    document.addEventListener('scroll', closeMenuOnScroll, true);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', closeMenuOnScroll, true);
    });

    this.loads
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.loadError.set(null);
          this.items.set([]);
          const filters = normalizeFilters(this.filterForm.getRawValue());
          return this.vendorService
            .getVendors({
              categoryId: filters.categoryId === 'all' ? undefined : filters.categoryId,
              hubId: filters.hubId === 'all' ? undefined : filters.hubId,
              liveStatus: isVendorLiveStatus(filters.liveStatus) ? filters.liveStatus : undefined,
              search: filters.search || undefined,
              cursor: this.cursor() ?? undefined,
              limit: PAGE_SIZE,
            })
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.nextCursor.set(null);
                this.loadError.set(vendorErrorMessage(error, 'تعذر تحميل المتاجر.'));
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      });

    this.filterForm.valueChanges
      .pipe(
        debounceTime(400),
        map(() => this.filterForm.getRawValue()),
        tap((value) => this.searchTooShort.set(value.search.trim().length === 1)),
        map((value) => normalizeFilters(value)),
        distinctUntilChanged(sameFilters),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((filters) => {
        if (sameFilters(filters, this.lastQuery)) {
          return;
        }
        this.lastQuery = filters;
        this.resetPage();
      });

    forkJoin({
      hubs: this.vendorService.getHubs().pipe(catchError(() => of([]))),
      categories: this.vendorService.getCategories().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ hubs, categories }) => {
        this.loadedHubs.set(hubs);
        this.loadedCategories.set(categories);
        this.loads.next();
      });
  }

  reload(): void {
    this.loads.next();
  }

  clearSearch(): void {
    this.filterForm.controls.search.setValue('');
  }

  hasActiveFilters(): boolean {
    const filters = normalizeFilters(this.filterForm.getRawValue());
    return (
      !!this.filterForm.controls.search.value.trim() ||
      filters.categoryId !== 'all' ||
      filters.hubId !== 'all' ||
      filters.liveStatus !== 'all'
    );
  }

  clearFilters(): void {
    this.filterForm.reset({
      search: '',
      categoryId: 'all',
      hubId: 'all',
      liveStatus: 'all',
    });
  }

  goNext(): void {
    const next = this.nextCursor();
    if (!next || this.loading()) {
      return;
    }
    this.backStack.update((stack) => [...stack, this.cursor()]);
    this.cursor.set(next);
    this.loads.next();
  }

  goBack(): void {
    const stack = this.backStack();
    if (stack.length === 0 || this.loading()) {
      return;
    }
    this.cursor.set(stack[stack.length - 1]);
    this.backStack.set(stack.slice(0, -1));
    this.loads.next();
  }

  categoryVisual(vendor: VendorListItem): CategoryVisual | null {
    const matched = this.categoryByName(vendor.categoryName);
    const backgroundColor = vendor.backgroundColor || matched?.backgroundColor || '';
    const icon = vendor.icon || matched?.iconUrl || '';
    const name = vendor.categoryName.trim();
    if (!name && !backgroundColor && !icon) {
      return null;
    }
    return { name, backgroundColor, icon };
  }

  isImageIcon(iconUrl: string): boolean {
    return isCategoryIconImage(iconUrl);
  }

  iconSrc(iconUrl: string): string {
    return categoryIconSrc(iconUrl);
  }

  logoSrc(url: string): string {
    return categoryIconSrc(url);
  }

  categoryText(hex: string): string {
    return categoryTextColor(hex);
  }

  getInitials(vendor: VendorListItem): string {
    return getVendorInitials(vendor.name);
  }

  liveStatusLabel(status: VendorApiLiveStatus): string {
    switch (status) {
      case 'OPEN':
        return 'مفتوح';
      case 'BUSY':
        return 'مشغول حالياً';
      case 'CLOSED':
        return 'مغلق الآن';
    }
  }

  /** Cairo clock time under a closed badge, e.g. `08:00`. `nextOpenAt` is an ISO instant. */
  formatNextOpen(value: string): string {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}/.test(trimmed) && !trimmed.includes('T')) {
      return trimmed.slice(0, 5);
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return trimmed.match(/\d{2}:\d{2}/)?.[0] ?? trimmed;
    }
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  toggleActions(vendor: VendorListItem, event: Event): void {
    event.stopPropagation();
    const panel = this.actionsMenu()?.nativeElement;
    const button = event.currentTarget;
    if (!panel || !(button instanceof HTMLElement)) {
      return;
    }

    if (panel.matches(':popover-open') && this.actionsVendor()?.id === vendor.id) {
      panel.hidePopover();
      return;
    }

    this.actionsVendor.set(vendor);
    this.cdr.detectChanges();
    const alreadyOpen = panel.matches(':popover-open');
    if (!alreadyOpen) {
      panel.style.visibility = 'hidden';
      panel.showPopover();
    }
    this.placeActionsMenu(panel, button);
    panel.style.visibility = 'visible';
  }

  closeActions(): void {
    this.actionsMenu()?.nativeElement.hidePopover();
  }

  onActionsToggle(event: Event): void {
    if (!(event instanceof ToggleEvent) || event.newState !== 'closed') {
      return;
    }
    // Defer so the router link click still runs on the item that closed the menu.
    queueMicrotask(() => this.actionsVendor.set(null));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const panel = this.actionsMenu()?.nativeElement;
    if (!panel?.matches(':popover-open')) {
      return;
    }
    if (event.target instanceof Node && panel.contains(event.target)) {
      return;
    }
    panel.hidePopover();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.actionsMenu()?.nativeElement.hidePopover();
  }

  onActiveToggle(vendor: VendorListItem, isActive: boolean): void {
    const current = this.items().find((item) => item.id === vendor.id);
    if (
      !current ||
      current.isActive === isActive ||
      this.pendingId() ||
      !this.auth.hasPermission('vendors.write')
    ) {
      return;
    }

    const previous = current.isActive;
    this.actionError.set(null);
    this.pendingId.set(vendor.id);
    this.patchActive(vendor.id, isActive);
    this.vendorService
      .updateVendor(vendor.id, { isActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pendingId.set(null);
          this.items.update((list) => {
            const status = activeLiveStatus(this.filterForm.controls.liveStatus.value);
            return list.flatMap((item) => {
              if (item.id !== vendor.id) {
                return [item];
              }
              const next: VendorListItem = {
                ...item,
                isActive: updated.systemStatus === 'active',
                liveStatus: updated.reportedLiveStatus ?? item.liveStatus,
                nextOpenAt:
                  updated.reportedNextOpenAt === undefined
                    ? item.nextOpenAt
                    : updated.reportedNextOpenAt,
              };
              if (status && next.liveStatus !== status) {
                return [];
              }
              return [next];
            });
          });
        },
        error: (error: unknown) => {
          this.patchActive(vendor.id, previous);
          this.pendingId.set(null);
          this.actionError.set(vendorErrorMessage(error, 'تعذر تحديث حالة المتجر.'));
        },
      });
  }

  private placeActionsMenu(panel: HTMLElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth || 196;
    const height = panel.offsetHeight || 44;
    const gap = 4;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - gap);
    }
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }

  private categoryByName(name: string): VendorCategory | null {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    return this.loadedCategories().find((category) => category.name === trimmed) ?? null;
  }

  private resetPage(): void {
    this.backStack.set([]);
    this.cursor.set(null);
    this.loads.next();
  }

  private patchActive(id: string, isActive: boolean): void {
    this.items.update((list) =>
      list.map((item) => (item.id === id ? { ...item, isActive } : item)),
    );
  }
}

function normalizeFilters(value: VendorFilters): VendorFilters {
  const search = value.search.trim();
  return {
    search: search.length >= 2 ? search : '',
    categoryId: value.categoryId || 'all',
    hubId: value.hubId || 'all',
    liveStatus: value.liveStatus || 'all',
  };
}

function sameFilters(left: VendorFilters, right: VendorFilters): boolean {
  return (
    left.search === right.search &&
    left.categoryId === right.categoryId &&
    left.hubId === right.hubId &&
    left.liveStatus === right.liveStatus
  );
}

function activeLiveStatus(value: string): VendorApiLiveStatus | null {
  return isVendorLiveStatus(value) ? value : null;
}
