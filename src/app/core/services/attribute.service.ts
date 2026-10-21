import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';

/** One entry in a vendor's product-attribute dictionary. */
export interface Attribute {
  id: string;
  name: string;
  isGlobal: boolean;
  suggestedValues: string[];
}

const VENDORS_URL = `${API_BASE_URL}/v1/vendors`;

/**
 * Vendor attribute dictionary (`/v1/vendors/{vendorId}/attributes`).
 * Used only to suggest option names and values. Product writes stay on ProductService.
 */
@Injectable({ providedIn: 'root' })
export class AttributeService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/vendors/{vendorId}/attributes` — a bare array, not a `{ data }` envelope. */
  getAttributes(vendorId: string): Observable<Attribute[]> {
    return this.http.get<unknown>(this.attributesUrl(vendorId)).pipe(
      map((body) => (Array.isArray(body) ? body.map(toAttribute).filter(isAttribute) : [])),
    );
  }

  /** `POST /v1/vendors/{vendorId}/attributes`. A duplicate name fails with 409. */
  createAttribute(vendorId: string, payload: { name: string }): Observable<Attribute> {
    const name = payload.name.trim();
    return this.http.post<unknown>(this.attributesUrl(vendorId), { name }).pipe(
      map((body) => toAttribute(body) ?? { id: '', name, isGlobal: false, suggestedValues: [] }),
    );
  }

  private attributesUrl(vendorId: string): string {
    return `${VENDORS_URL}/${encodeURIComponent(vendorId)}/attributes`;
  }
}

function isAttribute(value: Attribute | null): value is Attribute {
  return value !== null;
}

function toAttribute(value: unknown): Attribute | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const name = String(row['name'] ?? '').trim();
  if (!name) {
    return null;
  }
  const id = String(row['id'] ?? '').trim();
  const suggestedValues = Array.isArray(row['suggestedValues'])
    ? row['suggestedValues'].map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  return {
    id,
    name,
    isGlobal: row['isGlobal'] === true,
    suggestedValues,
  };
}
