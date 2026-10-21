import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { StaffRoleDefinition } from '../models/staff.model';
import { RoleService } from './role.service';

/** Staff screens read roles through here. Writes live on `RoleService`. */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly roleService = inject(RoleService);

  readonly roles = signal<StaffRoleDefinition[]>([]);

  /** `GET /v1/roles` */
  getRoles(): Observable<StaffRoleDefinition[]> {
    return this.roleService.getRoles().pipe(tap((roles) => this.roles.set(roles)));
  }
}
