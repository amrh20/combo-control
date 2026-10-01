export type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * Fold Arabic text so search treats spelling variants as the same word:
 * alef forms, alef maqsura, teh marbuta, tatweel, diacritics, and Arabic-Indic digits.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function matchesSearch(
  query: string,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) {
    return true;
  }
  return fields.some((field) => normalizeSearchText(String(field ?? '')).includes(needle));
}

export function matchesStatus(filter: string, isActive: boolean): boolean {
  if (filter === 'active') {
    return isActive;
  }
  if (filter === 'inactive') {
    return !isActive;
  }
  return true;
}

export function readControlValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    ? target.value
    : '';
}

export function asStatusFilter(value: string): StatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}
