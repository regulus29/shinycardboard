import { adjustOwnedQuantity } from '../../data';
import type { OwnedCount } from './grouping';

/**
 * Move a printing's total owned copies to `nextTotal` from a compact stepper. Added copies are
 * normal NM; removed copies come from the row the count points at. Finish and condition are
 * edited in card detail. Failures are already toasted by the data layer, so they are swallowed here.
 */
export function changeOwnedTotal(printingKey: string, count: OwnedCount | undefined, nextTotal: number): Promise<void> {
  return changeOwnedBy(printingKey, count, nextTotal - (count?.total ?? 0));
}

/** Relative form, safe for rapid repeated key presses that outrun re-rendering. */
export async function changeOwnedBy(printingKey: string, count: OwnedCount | undefined, delta: number): Promise<void> {
  if (delta === 0) return;
  const key = delta > 0 || !count ? { printingKey } : { printingKey, ...count.target };
  try {
    await adjustOwnedQuantity(key, delta);
  } catch {
    // reported by mutate()
  }
}
