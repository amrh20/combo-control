import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import {
  CAPTAIN_DEFAULT_MAX_CASH_EGP,
  CAPTAIN_EMPLOYMENT_OPTIONS,
  Captain,
  CaptainEmploymentType,
  captainUsesApp,
} from '../../../core/models/captain.model';
import {
  CaptainCashSettlement,
  SETTLEMENT_STATUS_LABELS,
} from '../../../core/models/captain-settlement.model';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import {
  CaptainDeliveredOrder,
  CaptainIssueRow,
  CaptainService,
  CaptainStats,
  captainErrorMessage,
} from '../../../core/services/captain.service';
import {
  CaptainSettlementService,
  settlementErrorMessage,
} from '../../../core/services/captain-settlement.service';
import { HubService } from '../../../core/services/hub.service';
import { egpToPiastres, piastresToEgp } from '../../../core/models/zone.model';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import {
  TablePagerComponent,
  slicePage,
} from '../../../shared/components/table-pager/table-pager.component';
import {
  ACCOUNT_STATUS_CONFIG,
  AVAILABILITY_CONFIG,
  CaptainProfile,
  CaptainRole,
  CaptainVehicleType,
  DRIVER_CURRENCY,
  ROLE_CONFIG,
  ROLE_OPTIONS,
  VEHICLE_OPTIONS,
  getInitials,
} from '../data/drivers.mock';

@Component({
  selector: 'ctrl-driver-details',
  standalone: true,
  imports: [
    NgClass,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputNumberModule,
    InputTextModule,
    CheckboxModule,
    ToastModule,
    StatCardComponent,
    TablePagerComponent,
    PermissionDirective,
  ],
  providers: [MessageService],
  templateUrl: './driver-details.component.html',
  styleUrl: './driver-details.component.scss',
})
export class DriverDetailsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly captainService = inject(CaptainService);
  private readonly settlementService = inject(CaptainSettlementService);
  private readonly hubService = inject(HubService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);

  readonly availabilityConfig = AVAILABILITY_CONFIG;
  readonly accountStatusConfig = ACCOUNT_STATUS_CONFIG;
  readonly roleConfig = ROLE_CONFIG;
  readonly currency = DRIVER_CURRENCY;
  readonly roleOptions = ROLE_OPTIONS;
  readonly employmentOptions = CAPTAIN_EMPLOYMENT_OPTIONS;
  readonly vehicleOptions = VEHICLE_OPTIONS;
  readonly activeHubs = this.hubService.activeHubs;
  readonly showVehicle = signal(true);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);

  private readonly captain = signal<Captain | null>(null);

  /** Profile fields the captains API returns, plus empty operational history. */
  readonly driver = computed(() => {
    const current = this.captain();
    if (!current) {
      return null;
    }
    return toProfile(current, this.hubService.nameOf(current.hubId));
  });

  readonly isEditing = signal(false);

  readonly ordersPage = signal(0);
  readonly ordersPageSize = signal(10);
  readonly complaintsPage = signal(0);
  readonly complaintsPageSize = signal(10);
  readonly historyPage = signal(0);
  readonly historyPageSize = signal(10);

  readonly confirmingId = signal<string | null>(null);
  readonly stats = signal<CaptainStats | null>(null);
  readonly orders = signal<CaptainDeliveredOrder[]>([]);
  readonly issues = signal<CaptainIssueRow[]>([]);
  readonly ordersNote = signal('لا توجد طلبات مسلّمة.');
  readonly issuesNote = signal('لا توجد مشاكل مسجّلة.');

  readonly deliveredOrders = computed(() =>
    this.orders().map((order) => ({
      id: order.orderNumber,
      date: order.completedAt,
      zoneName: order.zoneName,
      deliveryFeeEarned: order.captainProfit / 100,
      status: 'delivered' as const,
    })),
  );
  readonly complaints = computed(() => this.issues());
  readonly pagedOrders = computed(() =>
    slicePage(this.deliveredOrders(), this.ordersPage(), this.ordersPageSize()),
  );
  readonly pagedComplaints = computed(() =>
    slicePage(this.complaints(), this.complaintsPage(), this.complaintsPageSize()),
  );
  readonly settlementHistory = signal<CaptainCashSettlement[]>([]);
  readonly allSettlements = computed(() => mergeSettlements(this.settlementHistory(), this.captain()));
  readonly hasPendingSettlement = computed(() =>
    this.allSettlements().some((row) => row.status === 'PENDING'),
  );
  readonly pagedHistory = computed(() =>
    slicePage(this.allSettlements(), this.historyPage(), this.historyPageSize()),
  );
  readonly cashBalanceLabel = computed(() => {
    const amount = this.captain()?.companyCashBalance;
    if (amount == null) {
      return '—';
    }
    return this.moneyLabel(amount);
  });

  readonly profileForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', Validators.required],
    role: ['DELIVERY' as CaptainRole, Validators.required],
    hubId: ['', Validators.required],
    vehicleType: ['' as CaptainVehicleType | ''],
    licenseExpiry: [''],
    employmentType: ['FREELANCER' as CaptainEmploymentType, Validators.required],
    maxCashLimitEgp: [CAPTAIN_DEFAULT_MAX_CASH_EGP.FREELANCER, [Validators.required, Validators.min(0)]],
    fixedSalaryEgp: this.fb.control<number | null>(null),
    hasApp: [true],
  });

  constructor() {
    this.profileForm.controls.role.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((role) => this.syncVehicleControl(role));

    this.profileForm.controls.employmentType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((employmentType) => {
        this.profileForm.controls.maxCashLimitEgp.setValue(CAPTAIN_DEFAULT_MAX_CASH_EGP[employmentType]);
        this.syncFixedSalary(employmentType);
      });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/drivers']);
      return;
    }

    this.hubService
      .getHubs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });

    this.captainService
      .getCaptain(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (captain) => {
          this.captain.set(captain);
          this.loading.set(false);
          this.loadActivity(captain.id);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          if (error instanceof HttpErrorResponse && error.status === 404) {
            return;
          }
          this.loadError.set('تعذر تحميل بيانات الكابتن.');
        },
      });
  }

  getInitials(name: string): string {
    return getInitials(name);
  }

  vehicleLabel(type: CaptainVehicleType | ''): string {
    if (!type) return '—';
    return this.vehicleOptions.find((option) => option.value === type)?.label ?? type;
  }

  employmentLabel(type?: CaptainEmploymentType): string {
    if (!type) {
      return '—';
    }
    return this.employmentOptions.find((option) => option.value === type)?.label ?? type;
  }

  maxCashLimitLabel(piastres?: number): string {
    return this.moneyAmountLabel(piastres, 0);
  }

  fixedSalaryLabel(piastres?: number): string {
    return this.moneyAmountLabel(piastres, 0);
  }

  private moneyAmountLabel(piastres: number | undefined, minFractionDigits: number): string {
    if (piastres == null) {
      return '—';
    }
    return `${piastresToEgp(piastres).toLocaleString('en-US', {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: 2,
    })} ${this.currency}`;
  }

  moneyLabel(piastres: number): string {
    return `${piastresToEgp(piastres).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${this.currency}`;
  }

  settlementStatusLabel(status: string): string {
    const normalized = status === 'COMPLETED' ? 'CONFIRMED' : status;
    if (normalized === 'PENDING' || normalized === 'CONFIRMED' || normalized === 'REJECTED') {
      return SETTLEMENT_STATUS_LABELS[normalized];
    }
    return status;
  }

  settlementStatusClass(status: string): string {
    const normalized = status === 'COMPLETED' ? 'CONFIRMED' : status;
    if (normalized === 'PENDING') {
      return 'pending';
    }
    if (normalized === 'CONFIRMED') {
      return 'resolved';
    }
    return 'rejected';
  }

  confirmSettlement(row: CaptainCashSettlement): void {
    const captainId = this.captain()?.id;
    if (!captainId || row.status !== 'PENDING' || this.confirmingId()) {
      return;
    }

    this.confirmingId.set(row.id);
    this.settlementService
      .confirmSettlement(captainId, row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmingId.set(null);
          this.messages.add({
            severity: 'success',
            summary: 'تم التأكيد',
            detail: 'تم تأكيد استلام الكاش وتحديث رصيد العهدة.',
            life: 4000,
          });
          this.refreshCaptain(captainId);
          this.loadSettlements(captainId);
        },
        error: (error: unknown) => {
          this.confirmingId.set(null);
          this.messages.add({
            severity: 'error',
            summary: 'تعذر التأكيد',
            detail: settlementErrorMessage(error, 'تعذر تأكيد استلام العهدة.'),
            life: 6000,
          });
        },
      });
  }

  startEdit(): void {
    const current = this.captain();
    const profile = this.driver();
    if (!current || !profile) return;
    const employmentType = current.employmentType ?? 'FREELANCER';
    this.profileForm.patchValue(
      {
        name: profile.name,
        phone: profile.phone,
        role: profile.role,
        hubId: profile.hubId,
        vehicleType: '',
        licenseExpiry: '',
        employmentType,
        maxCashLimitEgp:
          current.maxCashLimit != null
            ? piastresToEgp(current.maxCashLimit)
            : CAPTAIN_DEFAULT_MAX_CASH_EGP[employmentType],
        fixedSalaryEgp:
          current.fixedSalary != null ? piastresToEgp(current.fixedSalary) : null,
        hasApp: captainUsesApp(current),
      },
      { emitEvent: false },
    );
    this.profileForm.controls.phone.disable({ emitEvent: false });
    this.syncVehicleControl(profile.role);
    this.syncFixedSalary(employmentType);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.profileForm.reset();
    this.profileForm.controls.phone.enable({ emitEvent: false });
  }

  saveProfile(): void {
    if (this.profileForm.invalid || this.saving()) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const current = this.captain();
    if (!current) return;

    const value = this.profileForm.getRawValue();
    const fleetFields =
      value.employmentType === 'FIXED' && value.fixedSalaryEgp != null
        ? { fixedSalary: egpToPiastres(value.fixedSalaryEgp) }
        : {};
    this.saving.set(true);
    this.captainService
      .updateCaptain(current.id, {
        fullName: value.name.trim(),
        role: value.role,
        hubId: value.hubId,
        employmentType: value.employmentType,
        maxCashLimit: egpToPiastres(value.maxCashLimitEgp),
        hasApp: value.hasApp,
        ...fleetFields,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.captain.set({
            ...updated,
            pendingSettlement: updated.pendingSettlement ?? current.pendingSettlement,
            companyCashBalance: updated.companyCashBalance ?? current.companyCashBalance,
          });
          this.saving.set(false);
          this.isEditing.set(false);
          this.profileForm.controls.phone.enable({ emitEvent: false });
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'تعذر الحفظ',
            detail: captainErrorMessage(error, 'تعذر حفظ بيانات الكابتن.'),
            life: 6000,
          });
        },
      });
  }

  private syncFixedSalary(employmentType: CaptainEmploymentType): void {
    const salary = this.profileForm.controls.fixedSalaryEgp;
    if (employmentType === 'FIXED') {
      salary.setValidators([Validators.required, Validators.min(0)]);
    } else {
      salary.clearValidators();
      salary.setValue(null, { emitEvent: false });
    }
    salary.updateValueAndValidity({ emitEvent: false });
  }

  /** Vehicle stays visible for delivery duties, and is not sent to the API. */
  private syncVehicleControl(role: CaptainRole): void {
    const vehicle = this.profileForm.controls.vehicleType;
    const show = role !== 'COLLECTOR';
    this.showVehicle.set(show);
    vehicle.clearValidators();
    if (!show) {
      vehicle.setValue('', { emitEvent: false });
    }
    vehicle.updateValueAndValidity();
  }

  goBack(): void {
    this.router.navigate(['/drivers']);
  }

  issueTypeLabel(type: string): string {
    return ISSUE_TYPE_LABELS[type] ?? type;
  }

  issueSeverity(type: string): 'low' | 'medium' | 'high' {
    if (type === 'VEHICLE_BREAKDOWN' || type === 'CUSTOMER_REFUSED') {
      return 'high';
    }
    if (type === 'CUSTOMER_UNREACHABLE' || type === 'SHOP_PROBLEM') {
      return 'medium';
    }
    return 'low';
  }

  issueResolution(issue: CaptainIssueRow): 'pending' | 'resolved' {
    return issue.resolvedAt || issue.resolution ? 'resolved' : 'pending';
  }

  deliveredLabel(): string {
    const count = this.stats()?.deliveredOrders;
    return count == null ? '—' : String(count);
  }

  acceptanceLabel(): string {
    const rate = this.stats()?.acceptanceRate;
    return rate == null ? '—' : `${rate}%`;
  }

  ratingLabel(): string {
    const rating = this.stats()?.customerRating;
    return rating == null ? '—' : rating.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  deliveryTimeLabel(): string {
    const minutes = this.stats()?.avgDeliveryTimeMinutes;
    return minutes == null ? '—' : `${minutes} د`;
  }

  private loadActivity(id: string): void {
    this.loadSettlements(id);
    forkJoin({
      stats: this.captainService.getStats(id),
      orders: this.captainService.getDeliveredOrders(id),
      issues: this.captainService.getIssues(id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.stats.set(result.stats);
          this.orders.set(result.orders);
          this.issues.set(result.issues);
        },
        error: () => {
          this.ordersNote.set('تعذر تحميل سجل الطلبات.');
          this.issuesNote.set('تعذر تحميل سجل المشاكل.');
        },
      });
  }

  private loadSettlements(id: string): void {
    this.settlementService
      .listSettlements(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.settlementHistory.set(sortSettlements(rows)),
        error: () => this.settlementHistory.set([]),
      });
  }

  private refreshCaptain(id: string): void {
    this.captainService
      .getCaptain(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (captain) => this.captain.set(captain),
        error: () => undefined,
      });
  }
}

function toProfile(captain: Captain, hubName: string): CaptainProfile {
  return {
    id: captain.id,
    name: captain.fullName,
    phone: captain.phone,
    role: captain.role,
    hubId: captain.hubId,
    hubName: hubName || '—',
    availability: 'available',
    accountStatus: captain.status === 'ACTIVE' ? 'active' : 'inactive',
    vehicleType: '',
    employmentType: captain.employmentType,
    maxCashLimit: captain.maxCashLimit,
    fixedSalary: captain.fixedSalary,
    licenseExpiry: '',
    hasApp: captain.hasApp,
    stats: {
      totalCompletedOrders: 0,
      totalCashCollected: 0,
      acceptanceRate: 0,
      customerRating: 0,
      avgDeliveryTimeMins: 0,
    },
    deliveredOrders: [],
    complaints: [],
  };
}

function mergeSettlements(
  rows: CaptainCashSettlement[],
  captain: Captain | null,
): CaptainCashSettlement[] {
  const merged = [...rows];
  const pending = captain?.pendingSettlement;
  if (pending?.status === 'PENDING' && !merged.some((row) => row.id === pending.id)) {
    merged.push(pending);
  }
  return sortSettlements(merged);
}

function sortSettlements(rows: CaptainCashSettlement[]): CaptainCashSettlement[] {
  return [...rows].sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') {
      return -1;
    }
    if (b.status === 'PENDING' && a.status !== 'PENDING') {
      return 1;
    }
    const aTime = Date.parse(a.requestedAt) || 0;
    const bTime = Date.parse(b.requestedAt) || 0;
    return bTime - aTime;
  });
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  CUSTOMER_UNREACHABLE: 'العميل لا يرد',
  WRONG_GPS: 'موقع خاطئ',
  CUSTOMER_REFUSED: 'العميل رفض الاستلام',
  VEHICLE_BREAKDOWN: 'عطل المركبة',
  SHOP_PROBLEM: 'مشكلة محل',
  OTHER: 'أخرى',
};
