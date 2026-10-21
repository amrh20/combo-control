import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import {
  PermissionGroup,
  ROLE_KEY_PATTERN,
  Role,
  groupPermissions,
  permissionLabel,
} from '../../../core/models/role.model';
import { RoleService, roleErrorMessage } from '../../../core/services/role.service';

@Component({
  selector: 'ctrl-role-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './role-form.component.html',
  styleUrl: './role-form.component.scss',
})

export class RoleFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly roleService = inject(RoleService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly role = input<Role | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  readonly permissionLabel = permissionLabel;
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly permissionsLoading = signal(true);
  readonly permissionsError = signal<string | null>(null);
  readonly permissions = signal<PermissionGroup['permissions']>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());

  readonly groups = computed(() => groupPermissions(this.permissions()));
  readonly held = computed(() => new Set(this.auth.permissions()));
  readonly selectedCount = computed(() => this.selected().size);
  /** A custom role that already includes a permission this account cannot grant. */
  readonly blockedByMissingGrant = computed(() =>
    [...this.selected()].some((key) => !this.held().has(key)),
  );

  readonly form = this.fb.nonNullable.group({
    key: ['', [Validators.required, Validators.pattern(ROLE_KEY_PATTERN)]],
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
  });

  constructor() {
    this.form.controls.key.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      const normalized = value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 50);
      if (normalized !== value) {
        this.form.controls.key.setValue(normalized, { emitEvent: false });
      }
    });

    this.roleService
      .getPermissions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (permissions) => {
          this.permissions.set(permissions);
          this.permissionsLoading.set(false);
        },
        error: () => {
          this.permissionsLoading.set(false);
          this.permissionsError.set('تعذر تحميل الصلاحيات.');
        },
      });

    effect(() => {
      const current = this.role();
      untracked(() => this.fill(current));
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.saving()) {
      this.close();
    }
  }

  get creating(): boolean {
    return this.role() === null;
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

  canGrant(key: string): boolean {
    return this.held().has(key);
  }

  isChecked(key: string): boolean {
    return this.selected().has(key);
  }

  toggle(key: string): void {
    if (!this.canGrant(key) || this.saving()) {
      return;
    }
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    this.saveError.set(null);
  }

  groupGrantable(group: PermissionGroup): string[] {
    return group.permissions.filter((permission) => this.canGrant(permission.key)).map((permission) => permission.key);
  }

  groupChecked(group: PermissionGroup): boolean {
    const keys = this.groupGrantable(group);
    return keys.length > 0 && keys.every((key) => this.selected().has(key));
  }

  toggleGroup(group: PermissionGroup): void {
    const keys = this.groupGrantable(group);
    if (keys.length === 0 || this.saving()) {
      return;
    }
    const turnOff = this.groupChecked(group);
    this.selected.update((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (turnOff) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
    this.saveError.set(null);
  }

  showKeyError(): boolean {
    const control = this.form.controls.key;
    return control.invalid && (control.touched || this.submitted());
  }

  showNameError(): boolean {
    const control = this.form.controls.name;
    return control.invalid && (control.touched || this.submitted());
  }

  save(): void {
    this.saveError.set(null);
    this.submitted.set(true);
    if (this.saving() || this.permissionsLoading() || this.permissionsError() || this.blockedByMissingGrant()) {
      return;
    }

    const permissions = [...this.selected()];
    if (this.creating) {
      if (this.form.invalid) {
        this.form.markAllAsTouched();
        return;
      }
      const { key, name } = this.form.getRawValue();
      this.saving.set(true);
      this.roleService.createRole({ key, name: name.trim(), permissions }).subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.saveError.set(roleErrorMessage(error, 'تعذر إنشاء الدور.'));
        },
      });
      return;
    }

    const current = this.role();
    if (!current || current.isSystem) {
      return;
    }
    this.saving.set(true);
    this.roleService.updateRolePermissions(current.key, permissions).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(roleErrorMessage(error, 'تعذر تحديث صلاحيات الدور.'));
      },
    });
  }

  private fill(role: Role | null): void {
    this.submitted.set(false);
    this.saveError.set(null);
    this.selected.set(new Set(role?.permissions ?? []));
    if (!role) {
      this.form.reset({ key: '', name: '' });
      this.form.controls.key.enable();
      this.form.controls.name.enable();
      return;
    }
    this.form.reset({ key: role.key, name: role.name });
    this.form.controls.key.disable();
    this.form.controls.name.disable();
  }
}
