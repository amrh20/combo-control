import { staffRoleLabel } from './staff.model';

/** Entities the audit log filter can narrow to. Values match `audit_log.entity`. */
export const AUDIT_ENTITIES = [
  'staff_user',
  'role',
  'captain',
  'customer',
  'zone',
  'sub_zone',
  'hub',
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ENTITY_OPTIONS: readonly { value: '' | AuditEntity; label: string }[] = [
  { value: '', label: 'كل الكيانات' },
  { value: 'staff_user', label: 'الموظفون' },
  { value: 'role', label: 'الأدوار' },
  { value: 'captain', label: 'الكباتن' },
  { value: 'customer', label: 'العملاء' },
  { value: 'zone', label: 'المناطق' },
  { value: 'sub_zone', label: 'المناطق الفرعية' },
  { value: 'hub', label: 'مراكز الانطلاق' },
];

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  staff_user: 'موظف',
  role: 'دور',
  captain: 'كابتن',
  customer: 'عميل',
  zone: 'منطقة',
  sub_zone: 'منطقة فرعية',
  hub: 'مركز انطلاق',
};

/** One row from `GET /v1/audit-log`. */
export interface AuditLogEntry {
  id: number;
  actorType: string | null;
  actorId: string | null;
  /** Staff role keys at the time of the action, comma-separated. */
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
}

export type AuditDiffKind = 'added' | 'removed' | 'changed';

export interface AuditDiffRow {
  path: string;
  kind: AuditDiffKind;
  beforeText: string;
  afterText: string;
}

export function isAuditEntity(value: string): value is AuditEntity {
  return (AUDIT_ENTITIES as readonly string[]).includes(value);
}

export function auditEntityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

/** Arabic labels for the role keys stored on the audit row. */
export function auditActorRoleLabel(actorRole: string | null): string {
  if (!actorRole?.trim()) {
    return '—';
  }
  return actorRole
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
    .map((key) => staffRoleLabel({ key, name: key }))
    .join('، ');
}

export function auditSnapshotsMissing(before: unknown, after: unknown): boolean {
  return before == null && after == null;
}

/** Field-level comparison of the `before` and `after` snapshots. */
export function buildAuditDiff(before: unknown, after: unknown): AuditDiffRow[] {
  const left = flattenAuditValue(before);
  const right = flattenAuditValue(after);
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const rows: AuditDiffRow[] = [];

  for (const path of paths) {
    const hasBefore = left.has(path);
    const hasAfter = right.has(path);
    const beforeValue = left.get(path);
    const afterValue = right.get(path);
    if (hasBefore && hasAfter && sameAuditValue(beforeValue, afterValue)) {
      continue;
    }
    rows.push({
      path,
      kind: !hasBefore ? 'added' : !hasAfter ? 'removed' : 'changed',
      beforeText: hasBefore ? formatAuditValue(beforeValue) : '',
      afterText: hasAfter ? formatAuditValue(afterValue) : '',
    });
  }

  return rows;
}

export function formatAuditJson(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  return JSON.stringify(value, null, 2);
}

function flattenAuditValue(value: unknown, prefix = ''): Map<string, unknown> {
  const flat = new Map<string, unknown>();
  if (!isPlainObject(value)) {
    if (prefix) {
      flat.set(prefix, value);
    }
    return flat;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    flat.set(prefix || '(empty)', value);
    return flat;
  }

  for (const [key, child] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) {
      const nested = flattenAuditValue(child, path);
      if (nested.size === 0) {
        flat.set(path, child);
      } else {
        nested.forEach((nestedValue, nestedPath) => flat.set(nestedPath, nestedValue));
      }
    } else {
      flat.set(path, child);
    }
  }

  return flat;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameAuditValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatAuditValue(value: unknown): string {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
