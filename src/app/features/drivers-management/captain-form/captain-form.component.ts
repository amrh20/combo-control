import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { map, of, switchMap } from 'rxjs';
import { PasswordToggleDirective } from '../../../core/directives/password-toggle.directive';
import {
  CAPTAIN_ROLE_OPTIONS,
  CAPTAIN_VEHICLE_OPTIONS,
  Captain,
  CaptainRole,
  CaptainVehicleType,
} from '../../../core/models/captain.model';
import { CaptainService, captainErrorMessage } from '../../../core/services/captain.service';
import { HubService } from '../../../core/services/hub.service';

@Component({
  selector: 'ctrl-captain-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    SelectModule,
    InputTextModule,
    ToastModule,
    PasswordToggleDirective,
  ],
  providers: [MessageService],
  templateUrl: './captain-form.component.html',
  styleUrl: '../captain-list/captain-list.component.scss',
})
export class CaptainFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly captainService = inject(CaptainService);
  private readonly hubService = inject(HubService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);

  readonly captain = input<Captain | null>(null);
  readonly closed = output<void>();

  readonly roleOptions = CAPTAIN_ROLE_OPTIONS;
  readonly vehicleOptions = CAPTAIN_VEHICLE_OPTIONS;
  /** Collectors travel on foot, so the vehicle field is hidden and sent as `NONE`. */
  readonly showVehicle = signal(true);
  readonly activeHubs = this.hubService.activeHubs;
  /** Active hubs, plus the captain's current hub when it is no longer active. */
  readonly hubOptions = computed(() => {
    const active = this.activeHubs();
    const currentId = this.captain()?.hubId;
    if (!currentId || active.some((hub) => hub.id === currentId)) {
      return active;
    }
    const current = this.hubService.getById(currentId);
    return current ? [...active, current] : active;
  });
  readonly saving = signal(false);
  readonly hubsError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    role: ['DELIVERY' as CaptainRole, Validators.required],
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    password: ['', Validators.required],
    hubId: ['', Validators.required],
    vehicleType: ['MOTORCYCLE' as CaptainVehicleType, Validators.required],
  });

  constructor() {
    this.hubService
      .getHubs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.hubsError.set('تعذر تحميل مراكز الانطلاق.'),
      });

    effect(() => {
      const current = this.captain();
      untracked(() => this.fill(current));
    });

    this.form.controls.role.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((role) => this.syncVehicle(role));

    effect(() => {
      const firstHub = this.activeHubs()[0];
      if (!firstHub || this.captain()) {
        return;
      }
      untracked(() => {
        if (!this.form.controls.hubId.value) {
          this.form.controls.hubId.setValue(firstHub.id);
        }
      });
    });
  }

  get creating(): boolean {
    return this.captain() === null;
  }

  close(): void {
    if (this.saving()) {
      return;
    }
    this.closed.emit();
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const current = this.captain();
    const fullName = value.fullName.trim();
    const phone = value.phone.trim();
    const role = value.role;
    const hubId = value.hubId;
    const password = value.password.trim();
    const vehicleType: CaptainVehicleType = role === 'COLLECTOR' ? 'NONE' : value.vehicleType;

    if (!fullName || !hubId || (!current && (!phone || !password))) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);

    const request = current
      ? this.captainService.updateCaptain(current.id, { fullName, role, hubId, vehicleType }).pipe(
          switchMap((updated) =>
            password
              ? this.captainService.resetPassword(updated.id, password).pipe(map(() => updated))
              : of(updated),
          ),
        )
      : this.captainService.createCaptain({
          phone,
          fullName,
          role,
          hubId,
          password,
          vehicleType,
        });

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.closed.emit();
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

  private fill(current: Captain | null): void {
    const password = this.form.controls.password;
    const phone = this.form.controls.phone;

    if (current) {
      this.form.reset(
        {
          role: current.role,
          fullName: current.fullName,
          phone: current.phone,
          password: '',
          hubId: current.hubId,
          vehicleType: selectableVehicle(current.vehicleType),
        },
        { emitEvent: false },
      );
      password.clearValidators();
      phone.disable({ emitEvent: false });
    } else {
      this.form.reset(
        {
          role: 'DELIVERY',
          fullName: '',
          phone: '',
          password: '',
          hubId: this.activeHubs()[0]?.id ?? '',
          vehicleType: 'MOTORCYCLE',
        },
        { emitEvent: false },
      );
      password.setValidators(Validators.required);
      phone.enable({ emitEvent: false });
    }

    password.updateValueAndValidity({ emitEvent: false });
    this.syncVehicle(this.form.controls.role.value);
  }

  /** A collector has no vehicle. Delivery duties must pick one of the API enums. */
  private syncVehicle(role: CaptainRole): void {
    const vehicle = this.form.controls.vehicleType;
    const usesVehicle = role !== 'COLLECTOR';
    this.showVehicle.set(usesVehicle);
    if (usesVehicle) {
      vehicle.setValidators(Validators.required);
      if (vehicle.value === 'NONE') {
        vehicle.setValue('MOTORCYCLE', { emitEvent: false });
      }
    } else {
      vehicle.clearValidators();
    }
    vehicle.updateValueAndValidity({ emitEvent: false });
  }
}

function selectableVehicle(vehicle: CaptainVehicleType): Exclude<CaptainVehicleType, 'NONE'> {
  return vehicle === 'NONE' ? 'MOTORCYCLE' : vehicle;
}
