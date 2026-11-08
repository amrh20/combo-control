import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { forkJoin } from 'rxjs';
import { PermissionDirective } from '../../core/directives/permission.directive';
import {
  CaptainSettlement,
  CaptainSettlementRole,
  FinancialsDateRange,
  FinancialsLedgerEntry,
  FinancialsLedgerType,
  FinancialsTimePeriod,
  VendorSettlement,
} from '../../core/models/financials.model';
import {
  CaptainSettlementService,
  settlementErrorMessage,
} from '../../core/services/captain-settlement.service';
import { FinancialsService } from '../../core/services/financials.service';
import {
  slicePage,
  TablePagerComponent,
} from '../../shared/components/table-pager/table-pager.component';

export type SettlementTab = 'captains' | 'vendors' | 'ledger';

@Component({
  selector: 'ctrl-financials',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, PermissionDirective, TablePagerComponent, ToastModule],
  providers: [MessageService],
  templateUrl: './financials.component.html',
  styleUrl: './financials.component.scss',
})
export class FinancialsComponent implements OnInit {
  private readonly financials = inject(FinancialsService);
  private readonly settlements = inject(CaptainSettlementService);
  private readonly messages = inject(MessageService);

  readonly settlementTabs: ReadonlyArray<{ id: SettlementTab; label: string }> = [
    { id: 'captains', label: 'تسويات الكباتن' },
    { id: 'vendors', label: 'تسويات المتاجر' },
    { id: 'ledger', label: 'سجل الحركات' },
  ];

  readonly timePeriods: ReadonlyArray<{ id: FinancialsTimePeriod; label: string }> = [
    { id: 'today', label: 'اليوم' },
    { id: 'week', label: 'هذا الأسبوع' },
    { id: 'month', label: 'هذا الشهر' },
    { id: 'all', label: 'الكل' },
  ];

  readonly activeTab = signal<SettlementTab>('captains');
  readonly period = signal<FinancialsTimePeriod>('all');
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly confirmingId = signal<string | null>(null);
  readonly payingVendorId = signal<string | null>(null);

  readonly captainsPage = signal(0);
  readonly captainsPageSize = signal(10);
  readonly vendorsPage = signal(0);
  readonly vendorsPageSize = signal(10);
  readonly ledgerPage = signal(0);
  readonly ledgerPageSize = signal(10);

  private readonly captainsState = signal<CaptainSettlement[]>([]);
  private readonly vendorsState = signal<VendorSettlement[]>([]);
  private readonly ledgerState = signal<FinancialsLedgerEntry[]>([]);

  readonly cashInTransit = signal(0);
  readonly vendorPayouts = signal(0);
  readonly captainPayouts = signal(0);
  readonly netRevenue = signal(0);

  readonly captains = this.captainsState.asReadonly();
  readonly vendors = this.vendorsState.asReadonly();
  readonly ledger = this.ledgerState.asReadonly();

  /** Captains with open cash, pending hand-in, or (freelancer) unpaid earnings. */
  readonly openCaptainSettlements = computed(() =>
    this.captainsState().filter((captain) => hasOpenCaptainSettlement(captain)),
  );

  readonly pagedCaptains = computed(() =>
    slicePage(this.openCaptainSettlements(), this.captainsPage(), this.captainsPageSize()),
  );
  readonly pagedVendors = computed(() =>
    slicePage(this.vendorsState(), this.vendorsPage(), this.vendorsPageSize()),
  );
  readonly pagedLedger = computed(() =>
    slicePage(this.ledgerState(), this.ledgerPage(), this.ledgerPageSize()),
  );

  ngOnInit(): void {
    this.reload();
  }

  selectTab(tab: SettlementTab): void {
    this.activeTab.set(tab);
  }

  selectPeriod(period: FinancialsTimePeriod): void {
    if (this.period() === period) {
      return;
    }
    this.period.set(period);
    this.reload();
  }

  roleLabel(role: CaptainSettlementRole): string {
    if (role === 'COLLECTOR') {
      return 'مُجمّع';
    }
    if (role === 'BOTH') {
      return 'طيار ومجمّع';
    }
    return 'طيار';
  }

  employmentLabel(captain: CaptainSettlement): string {
    return captain.employmentType === 'FIXED' ? 'راتب ثابت' : 'كابتن حر';
  }

  isFixedSalary(captain: CaptainSettlement): boolean {
    return captain.employmentType === 'FIXED';
  }

  /** Freelancer who uses the driver app — wallet settles there, not from ops. */
  isAutoSettledFreelancer(captain: CaptainSettlement): boolean {
    return !this.isFixedSalary(captain) && captain.hasApp !== false;
  }

  /** External freelancers without the app must be settled manually by ops. */
  isManualFreelancer(captain: CaptainSettlement): boolean {
    return !this.isFixedSalary(captain) && captain.hasApp === false;
  }

  /**
   * Collect company cash when the captain holds more than they are owed.
   * Fixed captains always remit cash; non-app freelancers do when cash > earnings.
   */
  canCollectCash(captain: CaptainSettlement): boolean {
    if (this.isFixedSalary(captain)) {
      return captain.cashCollected > 0 || captain.pendingSettlement !== null;
    }
    return this.isManualFreelancer(captain) && captain.cashCollected > captain.earningsDue;
  }

  /** Pay out earnings when the platform owes a non-app freelancer more than they hold. */
  canPayoutEarnings(captain: CaptainSettlement): boolean {
    return this.isManualFreelancer(captain) && captain.earningsDue > captain.cashCollected;
  }

  displayedEarnings(captain: CaptainSettlement): number {
    return this.isFixedSalary(captain) ? 0 : captain.earningsDue;
  }

  ledgerTypeLabel(type: FinancialsLedgerType): string {
    return type === 'COLLECTION' ? 'تحصيل' : 'صرف';
  }

  /** Confirm a captain's pending company-cash hand-in (`financials.payout`). */
  receiveCash(captain: CaptainSettlement): void {
    if (!this.canCollectCash(captain) || this.confirmingId()) {
      return;
    }

    if (this.isManualFreelancer(captain)) {
      this.confirmingId.set(captain.id);
      this.settlements.remitCash(captain.id).subscribe({
        next: () => {
          this.confirmingId.set(null);
          this.toast('success', `تم تحصيل عُهدة ${captain.name}.`);
          this.reload();
        },
        error: (error: unknown) => {
          this.confirmingId.set(null);
          this.toast('error', settlementErrorMessage(error, 'تعذر تحصيل العهدة.'));
        },
      });
      return;
    }

    const pending = captain.pendingSettlement;
    if (!pending) {
      if (captain.cashCollected > 0) {
        this.toast(
          'warn',
          'الكابتن لازم يطلب توريد العهدة من تطبيقه أولاً قبل التأكيد من هنا.',
        );
      }
      return;
    }

    this.confirmingId.set(captain.id);
    this.settlements.confirmSettlement(captain.id, pending.id).subscribe({
      next: () => {
        this.confirmingId.set(null);
        this.toast('success', `تم تأكيد توريد عُهدة ${captain.name}.`);
        this.reload();
      },
      error: (error: unknown) => {
        this.confirmingId.set(null);
        this.toast('error', settlementErrorMessage(error, 'تعذر تأكيد توريد العهدة.'));
      },
    });
  }

  /** Pay out earnings for a non-app freelancer (`POST .../settle-payout`). */
  payoutEarnings(captain: CaptainSettlement): void {
    if (!this.canPayoutEarnings(captain) || this.confirmingId()) {
      return;
    }

    this.confirmingId.set(captain.id);
    this.settlements.settlePayout(captain.id).subscribe({
      next: () => {
        this.confirmingId.set(null);
        this.toast('success', `تم تسديد مستحقات ${captain.name}.`);
        this.reload();
      },
      error: (error: unknown) => {
        this.confirmingId.set(null);
        this.toast('error', settlementErrorMessage(error, 'تعذر تسديد مستحقات الكابتن.'));
      },
    });
  }

  payVendor(vendor: VendorSettlement): void {
    if (vendor.salesDue <= 0 || this.payingVendorId()) {
      return;
    }
    this.payingVendorId.set(vendor.id);
    this.financials.payVendor(vendor.id).subscribe({
      next: () => {
        this.payingVendorId.set(null);
        this.toast('success', `تم تسديد مستحقات ${vendor.name}.`);
        this.reload();
      },
      error: () => {
        this.payingVendorId.set(null);
        this.toast('error', 'تعذر تسديد مستحقات المتجر.');
      },
    });
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set('');
    const range = rangeForPeriod(this.period());
    forkJoin({
      summary: this.financials.getSummary(range),
      captains: this.financials.getCaptains(),
      vendors: this.financials.getVendors(),
      ledger: this.financials.getLedger(100, range),
    }).subscribe({
      next: ({ summary, captains, vendors, ledger }) => {
        this.cashInTransit.set(summary.cashHeldByCaptains);
        this.captainPayouts.set(summary.captainDues);
        this.vendorPayouts.set(summary.merchantDues);
        this.netRevenue.set(summary.platformProfit);
        this.captainsState.set(captains);
        this.vendorsState.set(vendors);
        this.ledgerState.set(ledger);
        this.captainsPage.set(0);
        this.vendorsPage.set(0);
        this.ledgerPage.set(0);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('تعذر تحميل بيانات الماليات. حاول مرة أخرى.');
        this.toast('error', 'تعذر تحميل بيانات الماليات.');
      },
    });
  }

  private toast(severity: 'success' | 'error' | 'warn', detail: string): void {
    this.messages.add({ severity, summary: 'الماليات', detail, life: 5000 });
  }
}

/** Inclusive local-day bounds as ISO datetimes. `all` omits dates (all-time). */
function rangeForPeriod(period: FinancialsTimePeriod): FinancialsDateRange {
  if (period === 'all') {
    return {};
  }

  const now = new Date();
  const end = endOfDay(now);

  if (period === 'today') {
    return { startDate: startOfDay(now).toISOString(), endDate: end.toISOString() };
  }

  if (period === 'week') {
    return { startDate: startOfWeekSaturday(now).toISOString(), endDate: end.toISOString() };
  }

  return {
    startDate: startOfMonth(now).toISOString(),
    endDate: end.toISOString(),
  };
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Egypt week typically starts Saturday. */
function startOfWeekSaturday(date: Date): Date {
  const start = startOfDay(date);
  const day = start.getDay(); // 0 Sun … 6 Sat
  const daysSinceSaturday = (day + 1) % 7;
  start.setDate(start.getDate() - daysSinceSaturday);
  return start;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** Mirrors ops financials: hide zero/zero rows that clutter the settlements table. */
function hasOpenCaptainSettlement(captain: CaptainSettlement): boolean {
  if (captain.pendingSettlement !== null && captain.pendingSettlement.amount > 0) {
    return true;
  }
  if (captain.cashCollected > 0) {
    return true;
  }
  return captain.employmentType === 'FREELANCER' && captain.earningsDue > 0;
}
