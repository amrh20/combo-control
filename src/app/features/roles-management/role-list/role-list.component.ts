import { Component, computed, inject, signal } from '@angular/core';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { Role, roleDescription, roleDisplayName } from '../../../core/models/role.model';
import { RoleService } from '../../../core/services/role.service';
import { matchesSearch, readControlValue } from '../../../shared/utils/list-filter';
import { RoleFormComponent } from '../role-form/role-form.component';

@Component({
  selector: 'ctrl-role-list',
  standalone: true,
  imports: [PermissionDirective, RoleFormComponent],
  templateUrl: './role-list.component.html',
})
export class RoleListComponent {
  private readonly roleService = inject(RoleService);

  readonly searchQuery = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Role | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly roleName = roleDisplayName;
  readonly roleDescription = roleDescription;

  readonly filteredRoles = computed(() => {
    const query = this.searchQuery();
    return this.roleService.roles().filter((role) =>
      matchesSearch(query, role.name, role.key, roleDescription(role), roleDisplayName(role)),
    );
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.roleService.getRoles().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.loadError.set('تعذر تحميل الأدوار.');
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

  openEdit(role: Role): void {
    if (role.isSystem) {
      return;
    }
    this.editing.set(role);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  onSaved(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.reload();
  }
}
