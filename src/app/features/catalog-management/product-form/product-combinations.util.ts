/** One selected option within a variant group, part of a full combination row. */
export interface VariantOptionPick {
  variantIndex: number;
  variantId: string;
  variantName: string;
  optionIndex: number;
  optionId: string;
  optionLabel: string;
}

export type CombinationPermutation = VariantOptionPick[];

export interface VariantOptionGroupInput {
  id: string;
  name: string;
  options: Array<{ id: string; label: string }>;
}

/** Cartesian product of option groups (Weight × Color × …). */
export function cartesianProduct<T>(groups: T[][]): T[][] {
  if (groups.length === 0) {
    return [];
  }
  return groups.reduce<T[][]>(
    (acc, group) => acc.flatMap((prefix) => group.map((item) => [...prefix, item])),
    [[]],
  );
}

export function buildVariantPermutations(groups: VariantOptionGroupInput[]): CombinationPermutation[] {
  const picksByVariant = groups
    .map((variant, variantIndex) =>
      variant.options
        .map((option, optionIndex) => ({
          variantIndex,
          variantId: variant.id.trim(),
          variantName: variant.name.trim(),
          optionIndex,
          optionId: String(option.id ?? '').trim(),
          optionLabel: String(option.label ?? '').trim(),
        }))
        .filter((pick) => pick.optionLabel.length > 0),
    )
    .filter((group) => group.length > 0);

  if (!picksByVariant.length) {
    return [];
  }
  return cartesianProduct(picksByVariant);
}

/** Stable key while the admin edits labels (index-based). */
export function permutationKey(permutation: CombinationPermutation): string {
  return permutation.map((pick) => `${pick.variantIndex}:${pick.optionIndex}`).join('|');
}

export function combinationRowLabel(permutation: CombinationPermutation): string {
  return permutation.map((pick) => pick.optionLabel).join(' - ');
}

/** Backend `skuMapping`: variant name → option label. */
export function buildSkuMapping(permutation: CombinationPermutation): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pick of permutation) {
    map[pick.variantName] = pick.optionLabel;
  }
  return map;
}

export function mappingSignature(map: Record<string, string>): string {
  return Object.keys(map)
    .sort()
    .map((key) => `${key}=${map[key]}`)
    .join('|');
}

export function permutationMatchesMapping(
  permutation: CombinationPermutation,
  skuMapping: Record<string, string>,
): boolean {
  return permutation.every((pick) => {
    const variantKeys = pick.variantName
      ? [pick.variantName, pick.variantId, String(pick.variantIndex)]
      : pick.variantId
        ? [pick.variantId, String(pick.variantIndex)]
        : [String(pick.variantIndex)];
    const mapped = variantKeys.map((key) => skuMapping[key]).find((value) => value !== undefined);
    if (mapped === undefined) {
      return false;
    }
    const optionKeys = new Set(
      pick.optionLabel
        ? [pick.optionLabel, pick.optionId, String(pick.optionIndex)]
        : pick.optionId
          ? [pick.optionId, String(pick.optionIndex)]
          : [String(pick.optionIndex)],
    );
    return optionKeys.has(mapped);
  });
}
