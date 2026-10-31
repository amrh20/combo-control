/** Login role for a store dashboard account. */
export type StoreUserRole = 'MANAGER' | 'CASHIER';

/** Account state for a store dashboard login. */
export type StoreUserStatus = 'ACTIVE' | 'SUSPENDED';

/** Row from `GET /v1/ops/stores/{storeId}/users`. */
export interface StoreUser {
  id: string;
  storeId: string;
  fullName: string;
  /** Login name. Lowercase letters and digits, unique across every shop. */
  username: string;
  role: StoreUserRole;
  status: StoreUserStatus;
}

/** `POST /v1/ops/stores/{storeId}/users`. */
export interface CreateStoreUserPayload {
  fullName: string;
  username: string;
  password: string;
  role: StoreUserRole;
  isActive?: boolean;
}

/** `PATCH /v1/ops/stores/{storeId}/users/{userId}`. Omit `password` to keep the current one. */
export interface UpdateStoreUserPayload {
  fullName: string;
  username: string;
  role: StoreUserRole;
  password?: string;
  isActive?: boolean;
}

export const STORE_USER_ROLE_OPTIONS: ReadonlyArray<{ value: StoreUserRole; label: string }> = [
  { value: 'MANAGER', label: 'مدير' },
  { value: 'CASHIER', label: 'كاشير' },
];

const ROLE_LABELS: Readonly<Record<StoreUserRole, string>> = {
  MANAGER: 'مدير',
  CASHIER: 'كاشير',
};

const STATUS_LABELS: Readonly<Record<StoreUserStatus, string>> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
};

export function storeUserRoleLabel(role: StoreUserRole): string {
  return ROLE_LABELS[role];
}

export function storeUserStatusLabel(status: StoreUserStatus): string {
  return STATUS_LABELS[status];
}
