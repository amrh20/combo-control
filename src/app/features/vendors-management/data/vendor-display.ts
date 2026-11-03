import {
  LiveStatus,
  LiveStatusOverride,
  SystemStatus,
  VendorProfile,
} from '../../../core/models/vendor-profile.model';

export const LIVE_STATUS_CONFIG: Record<LiveStatus, { label: string; labelAr: string }> = {
  open:   { label: 'Open',   labelAr: 'مفتوح'          },
  busy:   { label: 'Busy',   labelAr: 'مشغول حالياً'  },
  closed: { label: 'Closed', labelAr: 'مغلق الآن'     },
};

export const SYSTEM_STATUS_CONFIG: Record<SystemStatus, { label: string; labelAr: string }> = {
  active:   { label: 'Active',   labelAr: 'نشط' },
  inactive: { label: 'Inactive', labelAr: 'غير نشط' },
};

export const LIVE_OVERRIDE_CONFIG: Record<
  LiveStatusOverride,
  { label: string; description: string }
> = {
  auto:         { label: 'تلقائي',        description: 'يتبع ساعات العمل' },
  force_busy:   { label: 'فرض مشغول',     description: 'إيقاف الطلبات مؤقتاً بسبب الضغط' },
  force_closed: { label: 'فرض مغلق',      description: 'إيقاف الطلبات لبقية اليوم' },
};

/** First two letters of a vendor name. "KFC" becomes "KF"; two words use one letter each. */
export function getVendorInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2 ? `${parts[0].charAt(0)}${parts[1].charAt(0)}` : trimmed.slice(0, 2);

  return initials.toLocaleUpperCase('en');
}

export function resolveLiveStatus(vendor: VendorProfile): LiveStatus {
  if (vendor.liveStatusOverride === 'force_busy') return 'busy';
  if (vendor.liveStatusOverride === 'force_closed') return 'closed';
  return vendor.liveStatus;
}

export function getEffectiveLiveStatus(vendor: VendorProfile): LiveStatus {
  return resolveLiveStatus(vendor);
}
