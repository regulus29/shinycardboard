import type { Variant } from '../types';
import { MAIN_SET_ORDER, PROMO_SET_ORDER, VARIANT_ORDER } from './vocabulary';

/** Minimal shape needed to order printings, so it works before the catalog exists. */
export interface Orderable {
  setId: string;
  collectorNumber: number;
  variant: Variant;
  printingKey: string;
}

/** Main sets first, unknown (new) sets next, promo sets last. */
export function setRank(setId: string): number {
  const code = setId.toUpperCase();
  const main = MAIN_SET_ORDER.indexOf(code);
  if (main !== -1) return main;
  const promo = PROMO_SET_ORDER.indexOf(code);
  return promo === -1 ? MAIN_SET_ORDER.length : MAIN_SET_ORDER.length + 1 + promo;
}

export function variantRank(variant: Variant): number {
  const index = VARIANT_ORDER.indexOf(variant);
  return index === -1 ? VARIANT_ORDER.length : index;
}

/** Canonical printing order: set release order, set code, number, variant, then key. */
export function comparePrintings(a: Orderable, b: Orderable): number {
  return (
    setRank(a.setId) - setRank(b.setId) ||
    a.setId.localeCompare(b.setId) ||
    a.collectorNumber - b.collectorNumber ||
    variantRank(a.variant) - variantRank(b.variant) ||
    a.printingKey.localeCompare(b.printingKey)
  );
}

/** Standard printings first, then canonical order. Used to pick a card's representative. */
export function compareStandardFirst(a: Orderable, b: Orderable): number {
  const aStandard = a.variant === 'standard' ? 0 : 1;
  const bStandard = b.variant === 'standard' ? 0 : 1;
  return aStandard - bStandard || comparePrintings(a, b);
}
