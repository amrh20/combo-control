import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CatalogImport,
  ImportPreview,
  ImportWriteBody,
  parseCatalogImport,
  parseImportPreview,
} from '../models/catalog-import.model';

const VENDORS_URL = `${environment.apiUrl}/v1/vendors`;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable({ providedIn: 'root' })
export class CatalogImportService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/vendors/{vendorId}/imports/template` */
  downloadTemplate(vendorId: string): Observable<Blob> {
    return this.http.get(this.templateUrl(vendorId), { responseType: 'blob' });
  }

  /**
   * `POST /v1/vendors/{vendorId}/imports?fileName=&sheet=`
   * The body is the raw file. The API rejects multipart `FormData`.
   */
  upload(vendorId: string, file: File, sheet?: string): Observable<CatalogImport> {
    return this.http
      .post<unknown>(this.root(vendorId), file, {
        headers: new HttpHeaders({ 'Content-Type': contentTypeFor(file) }),
        params: queryParams(file.name, sheet),
      })
      .pipe(
        map((body) => {
          const job = parseCatalogImport(body);
          if (!job.id) {
            throw new Error('استجابة الاستيراد لا تحتوي على معرّف.');
          }
          return job;
        }),
      );
  }

  /** `POST /v1/vendors/{vendorId}/imports/{id}/preview` */
  preview(vendorId: string, id: string, body: ImportWriteBody): Observable<ImportPreview> {
    return this.http
      .post<unknown>(`${this.root(vendorId)}/${id}/preview`, body)
      .pipe(map((response) => parseImportPreview(response)));
  }

  /** `POST /v1/vendors/{vendorId}/imports/{id}/commit` */
  commit(vendorId: string, id: string, body: ImportWriteBody): Observable<CatalogImport> {
    return this.http
      .post<unknown>(`${this.root(vendorId)}/${id}/commit`, body)
      .pipe(map((response) => parseCatalogImport(response)));
  }

  /** `GET /v1/vendors/{vendorId}/imports/{id}` */
  get(vendorId: string, id: string): Observable<CatalogImport> {
    return this.http.get<unknown>(`${this.root(vendorId)}/${id}`).pipe(map((body) => parseCatalogImport(body)));
  }

  /** `GET /v1/vendors/{vendorId}/imports/{id}/errors.xlsx` */
  downloadErrors(vendorId: string, id: string): Observable<Blob> {
    return this.http.get(`${this.root(vendorId)}/${id}/errors.xlsx`, { responseType: 'blob' });
  }

  private root(vendorId: string): string {
    return `${VENDORS_URL}/${vendorId}/imports`;
  }

  private templateUrl(vendorId: string): string {
    return `${this.root(vendorId)}/template`;
  }
}

function queryParams(fileName: string, sheet?: string): Record<string, string> {
  const params: Record<string, string> = { fileName };
  const sheetName = sheet?.trim();
  if (sheetName) {
    params['sheet'] = sheetName;
  }
  return params;
}

function contentTypeFor(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return 'text/csv';
  }
  if (name.endsWith('.xlsx')) {
    return XLSX_MIME;
  }
  throw new Error('يُقبل ملف Excel ‏(.xlsx) أو CSV فقط.');
}
