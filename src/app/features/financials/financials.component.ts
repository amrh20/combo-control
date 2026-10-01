import { Component, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  slicePage,
  TablePagerComponent,
} from '../../shared/components/table-pager/table-pager.component';

export type SettlementTab = 'captains' | 'vendors' | 'ledger';
export type CaptainSettlementRole = 'DELIVERY' | 'COLLECTOR';
export type LedgerEntryType = 'COLLECTION' | 'PAYOUT';

export interface CaptainSettlement {
  id: string;
  name: string;
  role: CaptainSettlementRole;
  cashCollected: number;
  earningsDue: number;
}

export interface VendorSettlement {
  id: string;
  name: string;
  hubName: string;
  salesDue: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerEntryType;
  amount: number;
  description: string;
}

const CAPTAIN_SETTLEMENTS: CaptainSettlement[] = [
  { id: 'DR-001', name: 'محمد العتيبي', role: 'DELIVERY', cashCollected: 1860, earningsDue: 420 },
  { id: 'DR-002', name: 'أحمد الشهري', role: 'DELIVERY', cashCollected: 940, earningsDue: 265 },
  { id: 'DR-003', name: 'خالد الدوسري', role: 'COLLECTOR', cashCollected: 3120, earningsDue: 180 },
  { id: 'DR-004', name: 'سعد القحطاني', role: 'DELIVERY', cashCollected: 0, earningsDue: 510 },
  { id: 'DR-005', name: 'فيصل المطيري', role: 'COLLECTOR', cashCollected: 2475.5, earningsDue: 95 },
  { id: 'DR-010', name: 'كريم حسن', role: 'DELIVERY', cashCollected: 680, earningsDue: 340 },
];

const VENDOR_SETTLEMENTS: VendorSettlement[] = [
  { id: 'SH-001', name: 'مطعم البيت', hubName: 'شارع ١٣', salesDue: 8420 },
  { id: 'SH-003', name: 'بقالة النور', hubName: 'عباس العقاد', salesDue: 5160.75 },
  { id: 'SH-006', name: 'محل الفاكهة الطازجة', hubName: 'شارع ٩', salesDue: 2340 },
  { id: 'SH-008', name: 'مخبز زهرة الأصيل', hubName: 'شارع ٩', salesDue: 1895 },
  { id: 'SH-004', name: 'صيدلية الرعاية', hubName: 'عباس العقاد', salesDue: 6730.25 },
  { id: 'SH-013', name: 'سوق الأمل', hubName: 'شارع ١٣', salesDue: 0 },
];

const LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: 'TXN-1042',
    date: '2026-09-30T18:40:00',
    type: 'COLLECTION',
    amount: 1250,
    description: 'توريد عُهدة من يوسف الغامدي',
  },
  {
    id: 'TXN-1041',
    date: '2026-09-30T16:15:00',
    type: 'PAYOUT',
    amount: 4300,
    description: 'تسديد مستحقات كافيه الصباح',
  },
  {
    id: 'TXN-1040',
    date: '2026-09-29T21:05:00',
    type: 'COLLECTION',
    amount: 890,
    description: 'توريد عُهدة من ناصر الزهراني',
  },
  {
    id: 'TXN-1039',
    date: '2026-09-29T13:20:00',
    type: 'PAYOUT',
    amount: 760,
    description: 'صرف أرباح توصيل لعبدالله الحربي',
  },
  {
    id: 'TXN-1038',
    date: '2026-09-28T19:50:00',
    type: 'PAYOUT',
    amount: 2980,
    description: 'تسديد مستحقات سوبرماركت الحارة',
  },
];

@Component({
  selector: 'ctrl-financials',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, TablePagerComponent],
  templateUrl: './financials.component.html',
  styleUrl: './financials.component.scss',
})
export class FinancialsComponent {
  readonly settlementTabs: ReadonlyArray<{ id: SettlementTab; label: string }> = [
    { id: 'captains', label: 'تسويات الكباتن' },
    { id: 'vendors', label: 'تسويات المتاجر' },
    { id: 'ledger', label: 'سجل الحركات' },
  ];

  readonly activeTab = signal<SettlementTab>('captains');
  readonly captainsPage = signal(0);
  readonly captainsPageSize = signal(10);
  readonly vendorsPage = signal(0);
  readonly vendorsPageSize = signal(10);
  readonly ledgerPage = signal(0);
  readonly ledgerPageSize = signal(10);

  private readonly captainsState = signal<CaptainSettlement[]>(CAPTAIN_SETTLEMENTS);
  private readonly vendorsState = signal<VendorSettlement[]>(VENDOR_SETTLEMENTS);
  private readonly ledgerState = signal<LedgerEntry[]>(LEDGER_ENTRIES);

  /** Commissions and retained delivery fees already booked to the platform. */
  readonly netRevenue = signal(18420.5);

  readonly captains = this.captainsState.asReadonly();
  readonly vendors = this.vendorsState.asReadonly();
  readonly ledger = this.ledgerState.asReadonly();

  readonly pagedCaptains = computed(() =>
    slicePage(this.captainsState(), this.captainsPage(), this.captainsPageSize()),
  );
  readonly pagedVendors = computed(() =>
    slicePage(this.vendorsState(), this.vendorsPage(), this.vendorsPageSize()),
  );
  readonly pagedLedger = computed(() =>
    slicePage(this.ledgerState(), this.ledgerPage(), this.ledgerPageSize()),
  );

  readonly cashInTransit = computed(() =>
    this.captainsState().reduce((sum, captain) => sum + captain.cashCollected, 0),
  );

  readonly vendorPayouts = computed(() =>
    this.vendorsState().reduce((sum, vendor) => sum + vendor.salesDue, 0),
  );

  readonly captainPayouts = computed(() =>
    this.captainsState().reduce((sum, captain) => sum + captain.earningsDue, 0),
  );

  selectTab(tab: SettlementTab): void {
    this.activeTab.set(tab);
  }

  roleLabel(role: CaptainSettlementRole): string {
    return role === 'DELIVERY' ? 'طيار' : 'مُجمّع';
  }

  ledgerTypeLabel(type: LedgerEntryType): string {
    return type === 'COLLECTION' ? 'تحصيل' : 'صرف';
  }

  receiveCash(id: string): void {
    const captain = this.captainsState().find((row) => row.id === id);
    if (!captain || captain.cashCollected <= 0) {
      return;
    }

    const amount = captain.cashCollected;
    this.captainsState.update((list) =>
      list.map((row) => (row.id === id ? { ...row, cashCollected: 0 } : row)),
    );
    this.prependLedger({
      type: 'COLLECTION',
      amount,
      description: `توريد عُهدة من ${captain.name}`,
    });
  }

  payVendor(id: string): void {
    const vendor = this.vendorsState().find((row) => row.id === id);
    if (!vendor || vendor.salesDue <= 0) {
      return;
    }

    const amount = vendor.salesDue;
    this.vendorsState.update((list) =>
      list.map((row) => (row.id === id ? { ...row, salesDue: 0 } : row)),
    );
    this.prependLedger({
      type: 'PAYOUT',
      amount,
      description: `تسديد مستحقات ${vendor.name}`,
    });
  }

  private prependLedger(entry: Omit<LedgerEntry, 'id' | 'date'>): void {
    this.ledgerState.update((list) => [
      {
        ...entry,
        id: this.nextTxnId(list),
        date: new Date().toISOString(),
      },
      ...list,
    ]);
  }

  private nextTxnId(list: LedgerEntry[]): string {
    const max = list.reduce((acc, entry) => {
      const n = Number.parseInt(entry.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `TXN-${max + 1}`;
  }
}
