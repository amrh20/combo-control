export type ImportStatus = 'UPLOADED' | 'RUNNING' | 'DONE' | 'FAILED';

export interface ImportColumnMapping {
  /** Zero-based column index in the uploaded sheet. */
  column: number;
  header: string;
  field: string;
  /** Required by the API when `field` is `variant` or `spec`. */
  name?: string;
}

export interface ImportPreviewProduct {
  name: string;
  barcode: string;
  priceLabel: string;
  quantityLabel: string;
  sectionName: string;
  subSection: string;
  variants: string;
}

export interface ImportPreview {
  created: number;
  updated: number;
  errors: number;
  /** Products the file would create or update. */
  productCount: number;
  products: ImportPreviewProduct[];
  issues: ImportIssue[];
  sectionsToCreate: string[];
}

export interface ImportSummary {
  total: number;
  processed: number;
  created: number;
  updated: number;
  errors: number;
}

export interface ImportIssue {
  row: number;
  column: string;
  message: string;
}

export interface CatalogImport {
  id: string;
  status: ImportStatus;
  headers: string[];
  /** Up to a few raw cell values per Excel header. */
  samples: Record<string, string[]>;
  mapping: { columns: ImportColumnMapping[] };
  summary: ImportSummary;
  issues: ImportIssue[];
  sectionsToCreate: string[];
}

export interface ImportWriteBody {
  columns: { column: number; field: string; name?: string }[];
}

export function mergeImport(previous: CatalogImport | null, next: CatalogImport): CatalogImport {
  if (!previous) {
    return next;
  }
  return {
    ...previous,
    ...next,
    id: next.id || previous.id,
    headers: next.headers.length ? next.headers : previous.headers,
    samples: Object.keys(next.samples).length ? next.samples : previous.samples,
    mapping: next.mapping.columns.length ? next.mapping : previous.mapping,
    status: next.status || previous.status,
  };
}

export function parseCatalogImport(body: unknown): CatalogImport {
  const record = unwrapEntity(body);
  if (!record) {
    throw new Error('استجابة الاستيراد غير مكتملة.');
  }

  let headers = readHeaders(record);
  const columns = readColumns(record, headers);
  if (!headers.length) {
    headers = columns.map((column) => column.header).filter((header) => header.length > 0);
  }

  const id = readString(record['id'] ?? record['importId']);

  return {
    id,
    status: readStatus(record['status']),
    headers,
    samples: readSamples(record, headers),
    mapping: { columns },
    summary: readSummary(record),
    issues: readIssues(record),
    sectionsToCreate: readSections(record),
  };
}

function unwrapEntity(body: unknown): Record<string, unknown> | null {
  const record = asRecord(body);
  if (!record) {
    return null;
  }
  return asRecord(record['data']) ?? asRecord(record['import']) ?? asRecord(record['catalogImport']) ?? record;
}

function readHeaders(record: Record<string, unknown>): string[] {
  const raw = record['headers'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      return item.trim();
    }
    const obj = asRecord(item);
    const name = obj ? readString(obj['name'] ?? obj['header'] ?? obj['title']) : '';
    return name || `عمود ${index + 1}`;
  });
}

function readColumns(record: Record<string, unknown>, headers: string[]): ImportColumnMapping[] {
  const mapping = asRecord(record['mapping']);
  const raw = mapping?.['columns'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const obj = asRecord(item);
    if (!obj) {
      return [];
    }
    const field = readString(obj['field'] ?? obj['target']);
    if (!field) {
      return [];
    }
    const indexed = readIndex(obj['column']);
    const headerFromIndex = indexed != null ? headers[indexed] ?? '' : '';
    const header = readString(obj['header'] ?? obj['source']) || headerFromIndex;
    const column = indexed ?? (header ? headers.indexOf(header) : -1);
    if (column < 0) {
      return [];
    }
    const name = readString(obj['name']);
    return [{ column, header: header || headers[column] || `عمود ${column + 1}`, field, ...(name ? { name } : {}) }];
  });
}

export function parseImportPreview(body: unknown): ImportPreview {
  const record = unwrapEntity(body) ?? {};
  const counts = asRecord(record['counts']) ?? asRecord(record['summary']) ?? {};
  const created = readNumber(counts['create'] ?? counts['created']);
  const updated = readNumber(counts['update'] ?? counts['updated']);
  const products = readPreviewProducts(record['products']);
  return {
    created,
    updated,
    errors: readNumber(counts['failed'] ?? counts['errors']),
    productCount: created + updated || products.length,
    products,
    issues: readIssues(record),
    sectionsToCreate: readSections(record),
  };
}

function readPreviewProducts(raw: unknown): ImportPreviewProduct[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const obj = asRecord(item);
    if (!obj) {
      return [];
    }
    const piastres = readOptionalNumber(obj['pricePiastres']);
    const quantity = readOptionalNumber(obj['quantity']);
    return [
      {
        name: readString(obj['name']) || '—',
        barcode: readString(obj['barcode']) || '—',
        priceLabel: piastres == null ? '—' : formatMoney(piastres / 100),
        quantityLabel: quantity == null ? '—' : String(quantity),
        sectionName: readSectionName(obj['section']),
        subSection: readSubSection(obj['section']),
        variants: readVariants(obj['variants']),
      },
    ];
  });
}

function readSectionName(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  const section = asRecord(value);
  return readString(section?.['name']) || '—';
}

function readSubSection(value: unknown): string {
  const section = asRecord(value);
  return readString(section?.['subSection']) || '—';
}

function readVariants(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '—';
  }
  const parts = value.flatMap((item) => {
    const variant = asRecord(item);
    if (!variant) {
      return [];
    }
    const name = readString(variant['name']);
    const options = Array.isArray(variant['options'])
      ? variant['options']
          .map((option) => (typeof option === 'string' ? option.trim() : readString(asRecord(option)?.['label'])))
          .filter((option) => option.length > 0 && !option.includes('مثال:'))
      : [];
    if (!name || options.length === 0) {
      return [];
    }
    return [`${name}: ${options.join('، ')}`];
  });
  return parts.length ? parts.join(' | ') : '—';
}

function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function readSamples(record: Record<string, unknown>, headers: string[]): Record<string, string[]> {
  const samples: Record<string, string[]> = {};
  for (const header of headers) {
    samples[header] = [];
  }
  const raw = record['sampleRows'] ?? record['samples'];
  if (!Array.isArray(raw)) {
    return samples;
  }
  for (const row of raw) {
    if (Array.isArray(row)) {
      headers.forEach((header, index) => pushSample(samples, header, row[index]));
      continue;
    }
    const obj = asRecord(row);
    if (!obj) {
      continue;
    }
    for (const header of headers) {
      pushSample(samples, header, obj[header]);
    }
  }
  return samples;
}

function pushSample(samples: Record<string, string[]>, header: string, value: unknown): void {
  if (value == null) {
    return;
  }
  const text = String(value).trim();
  if (!text || samples[header].length >= 3) {
    return;
  }
  samples[header].push(text);
}

function readSummary(record: Record<string, unknown>): ImportSummary {
  const summary = asRecord(record['summary']) ?? record;
  return {
    total: readNumber(summary['total'] ?? summary['rows']),
    processed: readNumber(summary['processed'] ?? summary['processedRows']),
    created: readNumber(summary['created'] ?? summary['new'] ?? summary['newProducts'] ?? summary['createdProducts']),
    updated: readNumber(summary['updated'] ?? summary['updates'] ?? summary['updatedProducts']),
    errors: readNumber(summary['errors'] ?? summary['errorCount'] ?? summary['failed'] ?? summary['issueCount']),
  };
}

function readIssues(record: Record<string, unknown>): ImportIssue[] {
  const summary = asRecord(record['summary']);
  const raw = record['issues'] ?? summary?.['issues'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    const obj = asRecord(item);
    if (!obj) {
      return [];
    }
    const message = readString(obj['message'] ?? obj['error']);
    if (!message) {
      return [];
    }
    return [
      {
        row: readNumber(obj['row'] ?? obj['rowNumber'] ?? obj['line']),
        column: readString(obj['column'] ?? obj['header'] ?? obj['field']),
        message,
      },
    ];
  });
}

function readSections(record: Record<string, unknown>): string[] {
  const summary = asRecord(record['summary']);
  const raw = record['sectionsToCreate'] ?? summary?.['sectionsToCreate'] ?? record['sections'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      const obj = asRecord(item);
      return obj ? readString(obj['name']) : '';
    })
    .filter((name) => name.length > 0);
}

function readStatus(value: unknown): ImportStatus {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (status === 'RUNNING' || status === 'DONE' || status === 'FAILED' || status === 'UPLOADED') {
    return status;
  }
  return 'UPLOADED';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : 0;
}

function readOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function readIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
