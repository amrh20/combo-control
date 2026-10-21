import { Component, computed, inject, signal } from '@angular/core';
import { Staff, staffRoleBadgeClass, staffRoleLabel } from '../../../core/models/staff.model';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { AuthService } from '../../../core/services/auth.service';
import { StaffService, staffErrorMessage } from '../../../core/services/staff.service';
import { matchesSearch, readControlValue } from '../../../shared/utils/list-filter';
import { StaffFormComponent } from '../staff-form/staff-form.component';

@Component({
  selector: 'ctrl-staff-list',
  standalone: true,
  imports: [PermissionDirective, StaffFormComponent],
  templateUrl: './staff-list.component.html',
})
export class StaffListComponent {
  private readonly staffService = inject(StaffService);
  private readonly auth = inject(AuthService);

  readonly currentUser = this.auth.currentUser;

  readonly searchQuery = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Staff | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pendingId = signal<string | null>(null);
  readonly roleBadgeClass = staffRoleBadgeClass;
  readonly roleLabel = staffRoleLabel;

  readonly filteredStaff = computed(() => {
    const query = this.searchQuery();
    return this.staffService.staff().filter((member) =>
      matchesSearch(query, member.fullName, member.email),
    );
  });

  constructor() {
    this.reload();
    this.staffService.loadScopeHubs().subscribe({
      error: () => undefined,
    });
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.staffService.loadStaff().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.loadError.set('تعذر تحميل الموظفين.');
      },
    });
  }

  onSearch(event: Event): void {
    this.searchQuery.set(readControlValue(event));
  }

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  openEdit(member: Staff): void {
    this.editing.set(member);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  isSuperAdmin(member: Staff): boolean {
    return member.roles.some((role) => role.key === 'SUPER_ADMIN');
  }

  editDisabled(member: Staff): boolean {
    return this.pendingId() === member.id;
  }

  /** A user cannot block themselves, and a super admin cannot be locked out from this list. */
  blockDisabled(member: Staff): boolean {
    return (
      this.pendingId() === member.id ||
      member.id === this.currentUser()?.id ||
      this.isSuperAdmin(member)
    );
  }

  /** MFA reset is an admin action on someone else, and only when 2FA is already on. */
  mfaDisabled(member: Staff): boolean {
    return !member.mfaEnabled || this.pendingId() === member.id || member.id === this.currentUser()?.id;
  }

  toggleBlock(member: Staff): void {
    if (this.pendingId() || member.id === this.currentUser()?.id || this.isSuperAdmin(member)) {
      return;
    }
    this.actionError.set(null);
    this.pendingId.set(member.id);
    const status = member.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    this.staffService.updateStaffStatus(member.id, status).subscribe({
      next: () => this.pendingId.set(null),
      error: (error: unknown) => {
        this.pendingId.set(null);
        this.actionError.set(staffErrorMessage(error, 'تعذر تحديث حالة الموظف.'));
      },
    });
  }

  resetMfa(member: Staff): void {
    if (this.pendingId() || !member.mfaEnabled || member.id === this.currentUser()?.id) {
      return;
    }
    this.actionError.set(null);
    this.pendingId.set(member.id);
    this.staffService.resetMfa(member.id).subscribe({
      next: () => this.pendingId.set(null),
      error: (error: unknown) => {
        this.pendingId.set(null);
        this.actionError.set(staffErrorMessage(error, 'تعذر إعادة ضبط التحقق بخطوتين.'));
      },
    });
  }

  scopeLabel(member: Staff): string {
    if (member.scope.all) {
      return 'كل المناطق';
    }
    if (member.scope.hubIds.length > 0) {
      return 'مراكز محددة';
    }
    if (member.scope.zoneIds.length > 0) {
      return 'مناطق محددة';
    }
    return 'بدون نطاق';
  }

  hubNames(member: Staff): string {
    if (member.scope.all) {
      return '';
    }
    return member.scope.hubIds
      .map((id) => this.staffService.hubName(id))
      .filter((name) => name.length > 0)
      .join('، ');
  }
}
