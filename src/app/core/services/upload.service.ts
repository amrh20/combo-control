import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export interface UploadedFile {
  url: string;
}

const UPLOADS_URL = `${API_BASE_URL}/v1/uploads`;

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);

  /**
   * `POST /v1/uploads`.
   * The body is the raw file bytes. The API rejects multipart `FormData`.
   * SVG is always sent as `image/svg+xml`, including when the browser leaves `file.type` empty.
   */
  uploadImage(file: File): Observable<UploadedFile> {
    const contentType = isSvgFile(file) ? 'image/svg+xml' : file.type;
    const body = file.type === contentType ? file : new Blob([file], { type: contentType });

    return this.http.post<UploadedFile>(UPLOADS_URL, body, {
      headers: new HttpHeaders({ 'Content-Type': contentType }),
    });
  }
}

function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || file.type === 'image/svg' || /\.svg$/i.test(file.name);
}
