import type { Catalog } from '../types';

/** Catalog as stored on disk: may carry tables mapping retired keys to their replacements. */
export type CatalogWithAliases = Catalog & {
  /** Retired printing key to current printing key. */
  keyAliases?: Record<string, string>;
  /** Retired card key to current card key. */
  cardKeyAliases?: Record<string, string>;
};

/** Source records that were merged into another one, as reported by the build. */
export interface DroppedRecord {
  kept: string;
  dropped: string;
}

function isAliased(key: string, aliases: Record<string, string>, present: Record<string, unknown>): boolean {
  const target = aliases[key];
  return target !== undefined && target in present;
}

/**
 * Printing keys present in the previous catalog that the new one neither contains nor aliases.
 * Owned copies attach to printing keys, so every entry returned would orphan user data.
 */
export function findLostKeys(previous: Catalog, next: CatalogWithAliases): string[] {
  const aliases = next.keyAliases ?? {};
  return Object.keys(previous.printings).filter((key) => !(key in next.printings) && !isAliased(key, aliases, next.printings));
}

/** Card keys present in the previous catalog that the new one neither contains nor aliases. */
export function findLostCardKeys(previous: Catalog, next: CatalogWithAliases): string[] {
  const aliases = next.cardKeyAliases ?? {};
  return Object.keys(previous.cards).filter((key) => !(key in next.cards) && !isAliased(key, aliases, next.cards));
}

/**
 * Alias every vanished previous printing key to the new key of the same source record, or of
 * the record it was merged into as a duplicate. `base` aliases (old key formats) are kept.
 */
export function aliasPreviousKeys(
  previous: CatalogWithAliases,
  next: Catalog,
  dropped: DroppedRecord[],
  base: Record<string, string> = {},
): Record<string, string> {
  const keyBySource = new Map(Object.values(next.printings).map((p) => [p.sourceId, p.printingKey]));
  const keptBySource = new Map(dropped.map((d) => [d.dropped, d.kept]));
  const aliases = { ...base };
  for (const [key, printing] of Object.entries(previous.printings)) {
    if (key in next.printings) continue;
    const source = printing.sourceId;
    const target = keyBySource.get(source) ?? keyBySource.get(keptBySource.get(source) ?? '');
    if (target !== undefined) aliases[key] = target;
  }
  return carryForward(previous.keyAliases, aliases, next.printings);
}

/** Keep older aliases alive: point them at the current key their target has since moved to. */
function carryForward(
  older: Record<string, string> | undefined,
  aliases: Record<string, string>,
  present: Record<string, unknown>,
): Record<string, string> {
  const result = { ...aliases };
  for (const [oldKey, target] of Object.entries(older ?? {})) {
    if (oldKey in result || oldKey in present) continue;
    const current = target in present ? target : aliases[target];
    if (current !== undefined) result[oldKey] = current;
  }
  return result;
}

/** Alias every vanished previous card key to the card that now holds its printings. */
export function aliasPreviousCardKeys(
  previous: CatalogWithAliases,
  next: Catalog,
  printingAliases: Record<string, string>,
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [cardKey, card] of Object.entries(previous.cards)) {
    if (cardKey in next.cards) continue;
    for (const printingKey of card.printingKeys) {
      const current = printingKey in next.printings ? printingKey : printingAliases[printingKey];
      const target = current === undefined ? undefined : next.printings[current]?.cardKey;
      if (target !== undefined) {
        aliases[cardKey] = target;
        break;
      }
    }
  }
  return carryForward(previous.cardKeyAliases, aliases, next.cards);
}
