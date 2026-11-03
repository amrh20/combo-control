import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import {
  AdjustOrderLinePayload,
  AdjustOrderPayload,
  OpsOrder,
  OpsOrderItem,
  OpsSubOrder,
  egpFromPiastres,
} from '../../../core/models/ops-order.model';
import { egpToPiastres, piastresToEgp } from '../../../core/models/zone.model';

interface AdjustLineDraft {
  id: string;
  name: string;
  vendorName: string;
  quantity: number;
  priceEgp: number;
  isRemoved: boolean;
}

@Component({
  selector: 'ctrl-adjust-order-modal',
  standalone: true,
  imports: [DecimalPipe, FormsModule, InputNumberModule],
  templateUrl: './adjust-order-modal.component.html',
  styleUrl: './adjust-order-modal.component.scss',
})
export class AdjustOrderModalComponent {
  readonly open = input(false);
  readonly order = input<OpsOrder | null>(null);
  readonly submitting = input(false);
  readonly submitError = input<string | null>(null);

  readonly closed = output<void>();
  readonly submitted = output<AdjustOrderPayload>();

  readonly currency = 'ج.م';
  readonly lines = signal<AdjustLineDraft[]>([]);
  readonly actualTotalEgp = signal<number | null>(null);

  readonly editableLines = computed(() => this.lines().filter((line) => !line.isRemoved));

  readonly draftSubtotalEgp = computed(() =>
    this.editableLines().reduce(
      (sum, line) => sum + Number(line.quantity || 0) * Number(line.priceEgp || 0),
      0,
    ),
  );

  readonly canSubmit = computed(() => {
    const total = this.actualTotalEgp();
    if (total == null || !Number.isFinite(total) || total < 0) {
      return false;
    }
    return this.editableLines().every((line) => {
      const qty = Math.round(Number(line.quantity));
      const price = Number(line.priceEgp);
      return Number.isFinite(qty) && qty >= 1 && qty <= 50 && Number.isFinite(price) && price >= 0;
    });
  });

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const order = this.order();
      if (!isOpen || !order) {
        return;
      }
      untracked(() => this.resetFromOrder(order));
    });
  }

  close(): void {
    if (this.submitting()) {
      return;
    }
    this.closed.emit();
  }

  optionLabels(item: OpsOrderItem): string {
    return item.options.map((option) => option.option).filter(Boolean).join(' · ');
  }

  updateQuantity(lineId: string, value: number | null): void {
    this.lines.update((rows) =>
      rows.map((row) => (row.id === lineId ? { ...row, quantity: Number(value ?? 0) } : row)),
    );
  }

  updatePrice(lineId: string, value: number | null): void {
    this.lines.update((rows) =>
      rows.map((row) => (row.id === lineId ? { ...row, priceEgp: Number(value ?? 0) } : row)),
    );
  }

  lineTotalEgp(line: AdjustLineDraft): number {
    return Number(line.quantity || 0) * Number(line.priceEgp || 0);
  }

  setActualTotal(value: number | null): void {
    this.actualTotalEgp.set(value == null ? null : Number(value));
  }

  confirm(): void {
    const order = this.order();
    const total = this.actualTotalEgp();
    if (!order || !this.canSubmit() || this.submitting() || total == null) {
      return;
    }
    const lines: AdjustOrderLinePayload[] = this.editableLines().map((line) => ({
      orderLineId: line.id,
      quantity: Math.round(Number(line.quantity)),
      pricePiastres: egpToPiastres(Number(line.priceEgp)),
    }));
    this.submitted.emit({
      version: order.version,
      lines,
      overrideTotalPiastres: egpToPiastres(Number(total)),
    });
  }

  private resetFromOrder(order: OpsOrder): void {
    const drafts: AdjustLineDraft[] = [];
    for (const sub of order.subOrders) {
      for (const item of sub.items) {
        drafts.push(this.toDraft(item, sub));
      }
    }
    this.lines.set(drafts);
    const seed =
      order.opsAdjustedTotal ??
      order.itemsSubtotal ??
      drafts
        .filter((line) => !line.isRemoved)
        .reduce((sum, line) => sum + egpToPiastres(this.lineTotalEgp(line)), 0);
    this.actualTotalEgp.set(egpFromPiastres(seed));
  }

  private toDraft(item: OpsOrderItem, sub: OpsSubOrder): AdjustLineDraft {
    const options = this.optionLabels(item);
    return {
      id: item.id,
      name: options ? `${item.name} · ${options}` : item.name,
      vendorName: sub.vendorName,
      quantity: item.quantity,
      priceEgp: piastresToEgp(item.unitPrice),
      isRemoved: item.isRemoved,
    };
  }
}
