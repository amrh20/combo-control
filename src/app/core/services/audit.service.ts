import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { AuditLogPage } from '../models/audit.model';

const AUDIT_URL = `${API_BASE_URL}/v1/audit-log`;

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/audit-log`. `cursor` is the last id from the previous page. */
  getLogs(
    entity?: string,
    entityId?: string,
    cursor?: string,
    limit = 20,
  ): Observable<AuditLogPage> {
    let params = new HttpParams().set('limit', String(limit));
    const entityValue = entity?.trim() ?? '';
    const entityIdValue = entityId?.trim() ?? '';
    if (entityValue) {
      params = params.set('entity', entityValue);
    }
    if (entityIdValue) {
      params = params.set('entityId', entityIdValue);
    }
    if (cursor) {
      params = params.set('cursor', cursor);
    }

    return this.http.get<AuditLogPage>(AUDIT_URL, { params }).pipe(map(toAuditPage));
  }
}

function toAuditPage(body: AuditLogPage | null): AuditLogPage {
  return {
    items: body?.items ?? [],
    nextCursor:
      body?.nextCursor == null || body.nextCursor === '' ? null : String(body.nextCursor),
  };
}
