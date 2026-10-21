import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { PasswordToggleDirective } from '../../../core/directives/password-toggle.directive';
import { Staff, StaffRole, StaffScope, staffRoleLabel } from '../../../core/models/staff.model';
import { RolesService } from '../../../core/services/roles.service';
import { StaffService, staffErrorMessage } from '../../../core/services/staff.service';
import { matchesSearch, readControlValue } from '../../../shared/utils/list-filter';

const PASSWORD_PATTERN = /^(?=.*[A-Za-z\u0600-\u06FF])(?=.*\d).*$/;

@Component({
  selector: 'ctrl-staff-form',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordToggleDirective],
  templateUrl: './staff-form.component.html',
})
export class StaffFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly staffService = inject(StaffService);
  private readonly rolesService = inject(RolesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly staff = input<Staff | null>(null);
  readonly closed = output<void>();

  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly rolesLoading = signal(true);
  readonly rolesError = signal<string | null>(null);
  readonly hubsLoaded = signal(false);
  readonly hubQuery = signal('');
  readonly hubMenuOpen = signal(false);
  readonly roleLabel = staffRoleLabel;
  private readonly loadedRoles = signal<StaffRole[]>([]);
  private readonly hubPicker = viewChild<ElementRef<HTMLElement>>('hubPicker');

  readonly activeHubs = computed(() => this.staffService.scopeHubs().filter((hub) => hub.isActive));

  readonly filteredHubs = computed(() => {
    const query = this.hubQuery();
    return this.activeHubs().filter((hub) => matchesSearch(query, hub.name));
  });

  readonly roleOptions = computed(() => {
    const loaded = this.loadedRoles();
    const current = this.staff()?.roles ?? [];
    const extras = current.filter((role) => !loaded.some((known) => known.key === role.key));
    return [...loaded, ...extras];
  });

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254), this.uniqueEmail.bind(this)]],
    phone: ['', [Validators.required, Validators.pattern(/^01[0125]\d{8}$/)]],
    password: [''],
    roleKey: ['', Validators.required],
    scopeMode: this.fb.nonNullable.control<'all' | 'hubs'>('all'),
    hubIds: this.fb.nonNullable.control<string[]>([]),
  });

  constructor() {
    this.rolesService
      .getRoles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roles) => {
          this.loadedRoles.set(roles.map((role) => ({ key: role.key, name: role.name })));
          this.rolesLoading.set(false);
        },
        error: () => {
          this.rolesLoading.set(false);
          this.rolesError.set('تعذر تحميل الأدوار.');
        },
      });

    this.staffService.loadScopeHubs().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.hubsLoaded.set(true),
      error: () => this.hubsLoaded.set(true),
    });

    effect(() => {
      const current = this.staff();
      untracked(() => this.fillForm(current));
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.saving()) {
      return;
    }
    if (this.hubMenuOpen()) {
      this.hubMenuOpen.set(false);
      return;
    }
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const root = this.hubPicker()?.nativeElement;
    if (!this.hubMenuOpen() || !root || !(event.target instanceof Node) || root.contains(event.target)) {
      return;
    }
    this.hubMenuOpen.set(false);
  }

  get creating(): boolean {
    return this.staff() === null;
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

  selectedHubs(): { id: string; name: string }[] {
    return this.form.controls.hubIds.value.map((id) => ({
      id,
      name: this.staffService.hubName(id) || id,
    }));
  }

  isHubChecked(hubId: string): boolean {
    return this.form.controls.hubIds.value.includes(hubId);
  }

  setScope(mode: 'all' | 'hubs'): void {
    this.form.controls.scopeMode.setValue(mode);
    this.form.controls.scopeMode.markAsTouched();
    if (mode === 'all') {
      this.form.controls.hubIds.setValue([]);
      this.hubQuery.set('');
      this.hubMenuOpen.set(false);
    }
  }

  onHubQuery(event: Event): void {
    this.hubQuery.set(readControlValue(event));
    this.hubMenuOpen.set(true);
  }

  toggleHubId(hubId: string): void {
    const current = this.form.controls.hubIds.value;
    const next = current.includes(hubId)
      ? current.filter((id) => id !== hubId)
      : [...current, hubId];
    this.form.controls.hubIds.setValue(next);
    this.form.controls.hubIds.markAsTouched();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  hubsMissing(): boolean {
    return (
      this.form.controls.scopeMode.value === 'hubs' &&
      this.form.controls.hubIds.value.length === 0 &&
      (this.submitted() || this.form.controls.hubIds.touched)
    );
  }

  save(): void {
    this.saveError.set(null);
    this.submitted.set(true);
    if (this.form.invalid || this.hubsMissing() || this.rolesLoading() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const role = this.roleOptions().find((item) => item.key === value.roleKey);
    if (!role) {
      return;
    }

    const current = this.staff();
    const scope = this.scopeFromForm(value.scopeMode, value.hubIds, current);
    const request = current
      ? this.saveExisting(current, value.roleKey, scope)
      : this.staffService.createStaff({
          email: value.email.trim().toLowerCase(),
          fullName: value.fullName.trim(),
          phone: value.phone.trim(),
          password: value.password,
          roleKeys: [value.roleKey],
          scope,
        });

    this.saving.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.closed.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(staffErrorMessage(error, 'تعذر حفظ بيانات الموظف.'));
      },
    });
  }

  private saveExisting(current: Staff, roleKey: string, scope: StaffScope): Observable<Staff> {
    const rolesChanged = current.roles[0]?.key !== roleKey;
    const scopeChanged = !this.sameScope(current.scope, scope);
    let request: Observable<Staff> = of(current);
    if (rolesChanged) {
      request = request.pipe(switchMap(() => this.staffService.updateStaffRoles(current.id, [roleKey])));
    }
    if (scopeChanged) {
      request = request.pipe(switchMap(() => this.staffService.updateStaffScope(current.id, scope)));
    }
    return request;
  }

  private scopeFromForm(mode: 'all' | 'hubs', hubIds: string[], current: Staff | null): StaffScope {
    if (mode === 'all') {
      return { all: true, zoneIds: [], hubIds: [] };
    }
    return {
      all: false,
      zoneIds: current?.scope.zoneIds ?? [],
      hubIds,
    };
  }

  private sameScope(left: StaffScope, right: StaffScope): boolean {
    return (
      left.all === right.all &&
      sameIds(left.zoneIds, right.zoneIds) &&
      sameIds(left.hubIds, right.hubIds)
    );
  }

  private fillForm(current: Staff | null): void {
    this.submitted.set(false);
    this.saveError.set(null);
    this.form.reset({
      fullName: current?.fullName ?? '',
      email: current?.email ?? '',
      phone: current?.phone ?? '',
      password: '',
      roleKey: current?.roles[0]?.key ?? '',
      scopeMode: current && !current.scope.all ? 'hubs' : 'all',
      hubIds: current ? [...current.scope.hubIds] : [],
    });
    this.syncPasswordValidators(current === null);
    this.syncIdentityValidators(current === null);
    this.hubQuery.set('');
    this.hubMenuOpen.set(false);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private syncIdentityValidators(creating: boolean): void {
    const { fullName, email, phone } = this.form.controls;
    if (creating) {
      fullName.setValidators([Validators.required, Validators.minLength(3), Validators.maxLength(100)]);
      email.setValidators([
        Validators.required,
        Validators.email,
        Validators.maxLength(254),
        this.uniqueEmail.bind(this),
      ]);
      phone.setValidators([Validators.required, Validators.pattern(/^01[0125]\d{8}$/)]);
    } else {
      fullName.clearValidators();
      email.clearValidators();
      phone.clearValidators();
    }
    fullName.updateValueAndValidity();
    email.updateValueAndValidity();
    phone.updateValueAndValidity();
  }

  private syncPasswordValidators(required: boolean): void {
    const password = this.form.controls.password;
    password.setValidators(
      required
        ? [
            Validators.required,
            Validators.minLength(8),
            Validators.maxLength(128),
            Validators.pattern(PASSWORD_PATTERN),
          ]
        : [],
    );
    password.updateValueAndValidity();
  }

  private uniqueEmail(control: AbstractControl): ValidationErrors | null {
    return this.staffService.emailTaken(String(control.value ?? ''), this.staff()?.id)
      ? { emailTaken: true }
      : null;
  }
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}
