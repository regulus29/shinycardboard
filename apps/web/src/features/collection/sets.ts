import type { Catalog, Variant } from '@sc/core';
import { paths } from '../../app/paths';
import { PARAMS, PROMO_LABEL } from './constants';

export interface VariantProgress {
  variant: Variant;
  owned: number;
  total: number;
}

export interface SetProgress {
  setId: string;
  label: string;
  owned: number;
  total: number;
  complete: boolean;
  variants: VariantProgress[];
}

/** Promotional sets (organized play, judge, general promos) are not part of the main completion goal. */
export const isPromoSet = (set: { label: string }): boolean => PROMO_LABEL.test(set.label);

const VARIANT_ORDER: readonly Variant[] = ['standard', 'alternate-art', 'overnumbered', 'signature', 'metal', 'other'];

/**
 * Completion per set: unique printings owned over printings in the catalog. With `standardOnly`
 * the headline numbers count standard printings only; the variant breakdown always shows every variant.
 */
export function computeSetProgress(catalog: Catalog, ownedKeys: ReadonlySet<string>, standardOnly: boolean): SetProgress[] {
  const bySet = new Map<string, Map<Variant, VariantProgress>>();
  for (const printing of Object.values(catalog.printings)) {
    const variants = bySet.get(printing.setId) ?? new Map<Variant, VariantProgress>();
    const progress = variants.get(printing.variant) ?? { variant: printing.variant, owned: 0, total: 0 };
    progress.total += 1;
    if (ownedKeys.has(printing.printingKey)) progress.owned += 1;
    variants.set(printing.variant, progress);
    bySet.set(printing.setId, variants);
  }
  return catalog.sets
    .filter((set) => bySet.has(set.setId))
    .map((set) => {
      const variants = VARIANT_ORDER.map((variant) => bySet.get(set.setId)?.get(variant)).filter((v): v is VariantProgress => Boolean(v));
      const counted = standardOnly ? variants.filter((v) => v.variant === 'standard') : variants;
      const owned = counted.reduce((sum, v) => sum + v.owned, 0);
      const total = counted.reduce((sum, v) => sum + v.total, 0);
      return { setId: set.setId, label: set.label, owned, total, complete: total > 0 && owned === total, variants };
    });
}

/** Overall share of printings owned, 0..1. */
export function overallProgress(progress: readonly SetProgress[]): number {
  const total = progress.reduce((sum, set) => sum + set.total, 0);
  return total === 0 ? 0 : progress.reduce((sum, set) => sum + set.owned, 0) / total;
}

/** Link into the collection for one set, optionally with an owned/missing preset. */
export function setLink(setId: string, scope: 'owned' | 'missing' | null, standardOnly: boolean): string {
  const filter = scope === 'missing' && standardOnly ? ' variant:standard' : '';
  const base = paths.collection(`set:${setId}${filter}`);
  return scope ? `${base}&${PARAMS.scope}=${scope}` : base;
}
