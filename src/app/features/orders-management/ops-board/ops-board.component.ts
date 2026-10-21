import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, forkJoin, interval, map, switchMap, tap } from 'rxjs';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import { OrderDetailsComponent } from '../../orders/order-details/order-details.component';
import {
  CLOSED_ORDER_STATUSES,
  LIVE_ORDER_STATUSES,
  ORDER_STATUS_CONFIG,
  OrderStatus,
  OpsOrder,
  OpsOrderRow,
  SUB_ORDER_STATUS_CONFIG,
  byNewestOrder,
  egpFromPiastres,
  formatOrderAge,
} from '../../../core/models/ops-order.model';
import { HubService } from '../../../core/services/hub.service';
import { OpsOrderService } from '../../../core/services/ops-order.service';

const PAGE_SIZE = 20;
/** Background refresh for the live board (no loading spinner). */
const LIVE_POLL_MS = 30_000;

type BoardFilter = 'LIVE' | 'CLOSED' | OrderStatus;
type BoardKind = 'live' | 'history';
type LoadMode = 'replace' | 'more';

interface BoardPage {
  mode: LoadMode;
  rows: OpsOrderRow[];
  nextCursor: string | null;
  liveCursors: Partial<Record<OrderStatus, string | null>>;
}

interface StatusGroup {
  status: OrderStatus;
  label: string;
  orders: OpsOrderRow[];
}

const LIVE_STATUS_OPTIONS: { value: BoardFilter; label: string }[] = [
  { value: 'LIVE', label: 'الطلبات الحالية' },
  ...LIVE_ORDER_STATUSES.map((status) => ({
    value: status,
    label: ORDER_STATUS_CONFIG[status].labelAr,
  })),
  ...CLOSED_ORDER_STATUSES.map((status) => ({
    value: status,
    label: ORDER_STATUS_CONFIG[status].labelAr,
  })),
];

const HISTORY_STATUS_OPTIONS: { value: BoardFilter; label: string }[] = [
  { value: 'CLOSED', label: 'كل السجل' },
  ...CLOSED_ORDER_STATUSES.map((status) => ({
    value: status,
    label: ORDER_STATUS_CONFIG[status].labelAr,
  })),
];

@Component({
  selector: 'ctrl-ops-board',
  standalone: true,
  imports: [DecimalPipe, ComboInputComponent, OrderDetailsComponent],
  templateUrl: './ops-board.component.html',
  styleUrl: './ops-board.component.scss',
})
export class OpsBoardComponent {
  /** `live` is the ops board. `history` lists delivered, cancelled, and failed orders. */
  readonly boardMode = input<BoardKind>('live');

  /** Rows from `GET /v1/orders`, newest first. */
  private readonly ordersApi = inject(OpsOrderService);
  private readonly hubsApi = inject(HubService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loads = new Subject<LoadMode>();

  readonly statusConfig = ORDER_STATUS_CONFIG;
  readonly shopStatusConfig = SUB_ORDER_STATUS_CONFIG;
  readonly currency = 'ج.م';
  readonly egp = egpFromPiastres;
  readonly formatAge = formatOrderAge;
  readonly statusOptions = computed(() =>
    this.boardMode() === 'history' ? HISTORY_STATUS_OPTIONS : LIVE_STATUS_OPTIONS,
  );

  readonly hubs = this.hubsApi.hubs;
  readonly searchQuery = signal('');
  readonly hubFilter = signal('');
  readonly statusFilter = signal<BoardFilter>('LIVE');
  readonly rows = signal<OpsOrderRow[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly liveCursors = signal<Partial<Record<OrderStatus, string | null>>>({});
  readonly cursor = signal<string | undefined>(undefined);
  readonly backStack = signal<(string | undefined)[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selectedOrderId = signal<string | null>(null);

  readonly pageNumber = computed(() => this.backStack().length + 1);
  /** Multi-status query: live in-progress, or the closed archive. */
  readonly isAggregate = computed(() => {
    const filter = this.statusFilter();
    return filter === 'LIVE' || filter === 'CLOSED';
  });
  readonly listTitle = computed(() => {
    const filter = this.statusFilter();
    if (filter === 'LIVE') {
      return 'الطلبات الحالية';
    }
    if (filter === 'CLOSED') {
      return 'سجل الطلبات';
    }
    return ORDER_STATUS_CONFIG[filter].labelAr;
  });

  readonly visibleRows = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const rows = this.rows();
    if (!query) {
      return rows;
    }
    return rows.filter((row) =>
      [row.orderNumber, row.customerName, row.area, row.hubName].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  });

  readonly groupedOrders = computed((): StatusGroup[] => {
    const rows = this.visibleRows();
    const statuses = Object.keys(ORDER_STATUS_CONFIG) as OrderStatus[];
    return statuses
      .map((status) => ({
        status,
        label: ORDER_STATUS_CONFIG[status].labelAr,
        orders: rows.filter((row) => row.status === status),
      }))
      .filter((group) => group.orders.length > 0);
  });

  readonly hasMore = computed(() => {
    if (this.isAggregate()) {
      return Object.values(this.liveCursors()).some((cursor) => Boolean(cursor));
    }
    return this.nextCursor() !== null;
  });

  constructor() {
    this.hubsApi
      .getHubs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });

    this.loads
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.loadError.set(null);
        }),
        switchMap((mode) =>
          this.fetch(mode).pipe(
            catchError(() => {
              this.loading.set(false);
              this.loadError.set('تعذر تحميل الطلبات.');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => this.applyPage(page));

    effect(() => {
      const history = this.boardMode() === 'history';
      const status = this.statusFilter();
      this.hubFilter();
      untracked(() => {
        if (history && !isHistoryFilter(status)) {
          this.statusFilter.set('CLOSED');
          return;
        }
        if (!history && status === 'CLOSED') {
          this.statusFilter.set('LIVE');
          return;
        }
        this.cursor.set(undefined);
        this.backStack.set([]);
        this.loads.next('replace');
      });
    });

    effect(() => {
      const visible = this.visibleRows();
      const current = this.selectedOrderId();
      const loading = this.loading();
      untracked(() => {
        if (loading && visible.length === 0) {
          return;
        }
        if (!visible.length) {
          this.selectedOrderId.set(null);
          return;
        }
        if (!current || !visible.some((row) => row.id === current)) {
          this.selectedOrderId.set(visible[0].id);
        }
      });
    });

    interval(LIVE_POLL_MS)
      .pipe(
        switchMap(() => {
          if (this.loading() || this.boardMode() !== 'live' || this.statusFilter() !== 'LIVE') {
            return EMPTY;
          }
          return this.fetch('replace').pipe(catchError(() => EMPTY));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => this.applyPage(page));
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  onHubChange(value: string): void {
    this.hubFilter.set(value);
  }

  onStatusChange(value: string): void {
    if (isBoardFilter(value)) {
      this.statusFilter.set(value);
      return;
    }
    this.statusFilter.set(this.boardMode() === 'history' ? 'CLOSED' : 'LIVE');
  }

  selectOrder(orderId: string): void {
    this.selectedOrderId.set(orderId);
  }

  refresh(): void {
    this.loads.next('replace');
  }

  loadMore(): void {
    if (!this.hasMore() || this.loading()) {
      return;
    }
    if (this.isAggregate()) {
      this.loads.next('more');
      return;
    }
    const next = this.nextCursor();
    if (!next) {
      return;
    }
    this.backStack.update((stack) => [...stack, this.cursor()]);
    this.cursor.set(next);
    this.loads.next('replace');
  }

  goBack(): void {
    const stack = this.backStack();
    if (!stack.length || this.loading()) {
      return;
    }
    this.cursor.set(stack[stack.length - 1]);
    this.backStack.set(stack.slice(0, -1));
    this.loads.next('replace');
  }

  /** Keep the open card in sync after a detail mutation. */
  onOrderChanged(order: OpsOrder): void {
    this.rows.update((rows) =>
      rows
        .map((row) => (row.id === order.id ? patchRow(row, order) : row))
        .filter((row) => this.keepsRow(row))
        .sort(byNewestOrder),
    );
  }

  rowTotal(row: OpsOrderRow): number {
    return this.egp(row.finalTotal ?? row.estimatedTotal);
  }

  private keepsRow(row: OpsOrderRow): boolean {
    const filter = this.statusFilter();
    if (filter === 'LIVE') {
      return LIVE_ORDER_STATUSES.includes(row.status);
    }
    if (filter === 'CLOSED') {
      return CLOSED_ORDER_STATUSES.includes(row.status);
    }
    return row.status === filter;
  }

  private aggregateStatuses(): readonly OrderStatus[] | null {
    const filter = this.statusFilter();
    if (filter === 'LIVE') {
      return LIVE_ORDER_STATUSES;
    }
    if (filter === 'CLOSED') {
      return CLOSED_ORDER_STATUSES;
    }
    return null;
  }

  private fetch(mode: LoadMode) {
    const hubId = this.hubFilter() || undefined;
    const statuses = this.aggregateStatuses();

    if (!statuses) {
      const filter = this.statusFilter();
      if (filter === 'LIVE' || filter === 'CLOSED') {
        return EMPTY;
      }
      return this.ordersApi
        .listOrders({
          status: filter,
          hubId,
          cursor: mode === 'replace' ? this.cursor() : undefined,
          limit: PAGE_SIZE,
        })
        .pipe(
          map(
            (page): BoardPage => ({
              mode,
              rows: page.items,
              nextCursor: page.nextCursor,
              liveCursors: {},
            }),
          ),
        );
    }

    const cursors = mode === 'more' ? this.liveCursors() : {};
    const requested =
      mode === 'more' ? statuses.filter((status) => Boolean(cursors[status])) : statuses;

    if (!requested.length) {
      return EMPTY;
    }

    return forkJoin(
      requested.map((status) =>
        this.ordersApi
          .listOrders({
            status,
            hubId,
            cursor: mode === 'more' ? cursors[status] ?? undefined : undefined,
            limit: PAGE_SIZE,
          })
          .pipe(map((page) => ({ status, page }))),
      ),
    ).pipe(
      map((pages): BoardPage => {
        const liveCursors: Partial<Record<OrderStatus, string | null>> = {};
        const rows = pages.flatMap(({ status, page }) => {
          liveCursors[status] = page.nextCursor;
          return page.items;
        });
        return { mode, rows, nextCursor: null, liveCursors };
      }),
    );
  }

  private applyPage(page: BoardPage): void {
    this.loading.set(false);
    if (page.mode === 'more' && this.isAggregate()) {
      const seen = new Set<string>();
      const merged = [...this.rows(), ...page.rows]
        .filter((row) => {
          if (seen.has(row.id)) {
            return false;
          }
          seen.add(row.id);
          return true;
        })
        .sort(byNewestOrder);
      this.rows.set(merged);
      this.liveCursors.update((current) => ({ ...current, ...page.liveCursors }));
      return;
    }

    this.rows.set([...page.rows].sort(byNewestOrder));
    this.nextCursor.set(page.nextCursor);
    this.liveCursors.set(page.liveCursors);
  }
}

function isBoardFilter(value: string): value is BoardFilter {
  return value === 'LIVE' || value === 'CLOSED' || value in ORDER_STATUS_CONFIG;
}

function isHistoryFilter(value: BoardFilter): boolean {
  return value === 'CLOSED' || CLOSED_ORDER_STATUSES.includes(value as OrderStatus);
}

function patchRow(row: OpsOrderRow, order: OpsOrder): OpsOrderRow {
  return {
    ...row,
    status: order.status,
    hubId: order.hubId,
    hubName: order.hub.name,
    customerName: order.customer.name,
    area: order.deliveryAddress.area,
    estimatedTotal: order.estimatedTotal,
    finalTotal: order.finalTotal,
    shopCount: order.subOrders.length,
    shopStatuses: order.subOrders.map((sub) => sub.status),
  };
}
