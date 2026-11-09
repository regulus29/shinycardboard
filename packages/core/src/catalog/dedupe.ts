import { imageBase, type Prepared } from './prepare';

export type DropReason = 'same-printing' | 'same-tcgplayer-id' | 'stale-standard';

export interface DuplicateDrop {
  kept: string;
  dropped: string;
  reason: DropReason;
}

interface Collapsed {
  kept: Prepared[];
  drops: DuplicateDrop[];
}

/**
 * Prefer the entry with a TCGplayer id, then the smallest source id (the oldest record). The
 * mutable `updated_on` is deliberately not used, so a source edit cannot change which record wins.
 */
function compareDuplicates(a: Prepared, b: Prepared): number {
  const missingId = (item: Prepared) => (item.record.tcgplayer_id ? 0 : 1);
  return (
    missingId(a) - missingId(b) ||
    a.record.id.localeCompare(b.record.id)
  );
}

/** Same set, source id and artwork: these identify one physical card face. */
function artworkKey(item: Prepared): string {
  return [item.record.set.set_id, item.record.riftbound_id, imageBase(item.record)].join('|');
}

/** Groups of two or more items sharing a key. Items whose key is null are ignored. */
function sharedGroups(items: Prepared[], keyOf: (item: Prepared) => string | null): Prepared[][] {
  const groups = new Map<string, Prepared[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function finish(items: Prepared[], drops: DuplicateDrop[], dropped: Set<Prepared>): Collapsed {
  return { kept: items.filter((item) => !dropped.has(item)), drops };
}

/** Keep the best member of each group that `keyOf` puts together. */
function collapse(items: Prepared[], keyOf: (item: Prepared) => string | null, reason: DropReason): Collapsed {
  const dropped = new Set<Prepared>();
  const drops: DuplicateDrop[] = [];
  for (const group of sharedGroups(items, keyOf)) {
    const [winner, ...losers] = [...group].sort(compareDuplicates) as [Prepared, ...Prepared[]];
    for (const loser of losers) {
      dropped.add(loser);
      drops.push({ kept: winner.record.id, dropped: loser.record.id, reason });
    }
  }
  return finish(items, drops, dropped);
}

function isStaleCandidate(item: Prepared): boolean {
  return item.variant === 'standard' && !item.record.tcgplayer_id;
}

/**
 * The source lists stale legacy records next to the real ones: a standard record with no
 * TCGplayer id that shares set, source id and artwork with any other record is a phantom of it.
 */
function dropStaleStandards(items: Prepared[]): Collapsed {
  const dropped = new Set<Prepared>();
  const drops: DuplicateDrop[] = [];
  for (const group of sharedGroups(items, artworkKey)) {
    const real = group.filter((item) => !isStaleCandidate(item));
    const winner = [...real].sort(compareDuplicates)[0];
    if (!winner) continue;
    for (const item of group.filter(isStaleCandidate)) {
      dropped.add(item);
      drops.push({ kept: winner.record.id, dropped: item.record.id, reason: 'stale-standard' });
    }
  }
  return finish(items, drops, dropped);
}

/**
 * Collapse source duplicates of one physical printing in three passes: identical variant of
 * the same artwork, the same TCGplayer product within a set, then stale standard
 * phantoms. Survivors keep their input order.
 */
export function dropDuplicates(items: Prepared[]): Collapsed {
  const samePrinting = collapse(items, (item) => `${artworkKey(item)}|${item.variantSlug}`, 'same-printing');
  const sameProduct = collapse(
    samePrinting.kept,
    (item) =>
      item.record.tcgplayer_id ? `${item.record.set.set_id}|${item.record.tcgplayer_id}` : null,
    'same-tcgplayer-id',
  );
  const stale = dropStaleStandards(sameProduct.kept);
  return { kept: stale.kept, drops: [...samePrinting.drops, ...sameProduct.drops, ...stale.drops] };
}
