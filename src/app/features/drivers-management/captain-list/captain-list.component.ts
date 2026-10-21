import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { catchError, of } from 'rxjs';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import {
  Captain,
  CaptainStatus,
  captainRoleBadge,
  captainRoleLabel,
  captainStatusLabel,
} from '../../../core/models/captain.model';
import { AuthService } from '../../../core/services/auth.service';
import { CaptainService, captainErrorMessage } from '../../../core/services/captain.service';
import { HubService } from '../../../core/services/hub.service';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import { matchesSearch } from '../../../shared/utils/list-filter';
import { CaptainFormComponent } from '../captain-form/captain-form.component';

@Component({
  selector: 'ctrl-captain-list',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    TableModule,
    ToggleSwitchModule,
    ToastModule,
    PermissionDirective,
    ComboInputComponent,
    CaptainFormComponent,
  ],
  providers: [MessageService],
  templateUrl: './captain-list.component.html',
  styleUrl: './captain-list.component.scss',
})
export class CaptainListComponent {
  readonly auth = inject(AuthService);
  private readonly captainService = inject(CaptainService);
  private readonly hubService = inject(HubService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);

  readonly roleLabel = captainRoleLabel;
  readonly roleBadge = captainRoleBadge;
  readonly statusLabel = captainStatusLabel;

  readonly searchQuery = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Captain | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly pendingId = signal<string | null>(null);
  /** Optimistic status while a toggle request is in flight, cleared on success or failure. */
  private readonly statusDraft = signal<Readonly<Record<string, CaptainStatus>>>({});

  readonly filteredCaptains = computed(() => {
    const query = this.searchQuery();
    return this.captainService.captains().map((captain) => ({
      ...captain,
      hubName: this.hubService.nameOf(captain.hubId) || '—',
    })).filter((captain) =>
      matchesSearch(
        query,
        captain.fullName,
        captain.phone,
        captain.hubName,
        captain.id,
        captainRoleLabel(captain.role),
        captainStatusLabel(captain.status),
      ),
    );
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.hubService
      .getHubs()
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.captainService
      .getCaptains()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loading.set(false),
        error: () => {
          this.loading.set(false);
          this.loadError.set('تعذر تحميل الكباتن.');
        },
      });
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  displayStatus(captain: Captain): CaptainStatus {
    return this.statusDraft()[captain.id] ?? captain.status;
  }

  isAccountActive(captain: Captain): boolean {
    return this.displayStatus(captain) === 'ACTIVE';
  }

  onAccountToggle(captain: Captain, active: boolean): void {
    const status: CaptainStatus = active ? 'ACTIVE' : 'BLOCKED';
    if (this.pendingId() || !this.auth.hasPermission('drivers.write') || captain.status === status) {
      return;
    }

    this.pendingId.set(captain.id);
    this.statusDraft.update((draft) => ({ ...draft, [captain.id]: status }));
    this.captainService
      .updateCaptain(captain.id, { status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pendingId.set(null);
          this.clearStatusDraft(captain.id);
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.clearStatusDraft(captain.id);
          this.messages.add({
            severity: 'error',
            summary: 'تعذر تحديث الحساب',
            detail: captainErrorMessage(error, 'تعذر تحديث حالة الكابتن.'),
            life: 6000,
          });
        },
      });
  }

  private clearStatusDraft(id: string): void {
    this.statusDraft.update((draft) => {
      if (!(id in draft)) {
        return draft;
      }
      const next = { ...draft };
      delete next[id];
      return next;
    });
  }

  openAddModal(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  openEditModal(captain: Captain): void {
    this.editing.set(captain);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }
}
