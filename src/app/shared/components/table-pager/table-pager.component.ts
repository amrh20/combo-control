import { Component, computed, input, output } from '@angular/core';

export function clampPage(total: number, page: number, pageSize: number): number {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / size));
  return Math.min(Math.max(0, page), pages - 1);
}

export function slicePage<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize);
  const current = clampPage(items.length, page, size);
  const start = current * size;
  return items.slice(start, start + size);
}

@Component({
  selector: 'ctrl-table-pager',
  standalone: true,
  templateUrl: './table-pager.component.html',
  styleUrl: './table-pager.component.scss',
})
export class TablePagerComponent {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([10, 25, 50]);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly safePage = computed(() => clampPage(this.total(), this.page(), this.pageSize()));

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(Math.max(0, this.total()) / Math.max(1, this.pageSize()))),
  );

  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : this.safePage() * this.pageSize() + 1,
  );

  readonly rangeEnd = computed(() =>
    Math.min(this.total(), (this.safePage() + 1) * this.pageSize()),
  );

  readonly pages = computed(() =>
    Array.from({ length: this.pageCount() }, (_, index) => index),
  );

  goTo(page: number): void {
    const next = clampPage(this.total(), page, this.pageSize());
    if (next !== this.safePage()) {
      this.pageChange.emit(next);
    }
  }

  onPageSize(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    this.pageSizeChange.emit(value);
    this.pageChange.emit(0);
  }
}
