import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export const ERASE_CONFIRMATION = 'ERASE ALL DATA';

const RESET_URL = `${environment.apiUrl}/v1/ops/maintenance/reset`;

@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly http = inject(HttpClient);

  /** `POST /v1/ops/maintenance/reset`. Auth is attached by the HTTP interceptor. */
  resetDatabase(): Observable<unknown> {
    return this.http.post(RESET_URL, { confirm: ERASE_CONFIRMATION });
  }
}
