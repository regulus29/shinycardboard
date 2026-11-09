import type { Card, Catalog, Printing } from '../types';
import { normalizeText } from './text';

/** Lookup tables over a catalog, built once per catalog object. */
export interface CatalogIndex {
  catalog: Catalog;
  printingsByTcgplayerId: Map<string, Printing[]>;
  /** Keyed by `setNumberKey`. */
  printingsBySetNumber: Map<string, Printing[]>;
  /** Normalized card name to cards carrying it. */
  cardsByName: Map<string, Card[]>;
  /** Normalized names bucketed by length, so fuzzy search only visits names of a plausible length. */
  namesByLength: Map<number, [name: string, cards: Card[]][]>;
  /** Normalized set id or label to set id. */
  setIdByName: Map<string, string>;
}

export const setNumberKey = (setId: string, number: number): string => `${setId.toLowerCase()}|${number}`;

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function indexSets(catalog: Catalog): Map<string, string> {
  const byName = new Map<string, string>();
  const register = (setId: string, label: string) => {
    byName.set(normalizeText(setId), setId);
    byName.set(normalizeText(label), setId);
  };
  for (const set of catalog.sets) register(set.setId, set.label);
  for (const printing of Object.values(catalog.printings)) register(printing.setId, printing.setLabel);
  return byName;
}

function buildIndex(catalog: Catalog): CatalogIndex {
  const printingsByTcgplayerId = new Map<string, Printing[]>();
  const printingsBySetNumber = new Map<string, Printing[]>();
  const cardsByName = new Map<string, Card[]>();

  for (const printing of Object.values(catalog.printings)) {
    if (printing.tcgplayerId) pushTo(printingsByTcgplayerId, printing.tcgplayerId.trim(), printing);
    pushTo(printingsBySetNumber, setNumberKey(printing.setId, printing.collectorNumber), printing);
  }
  for (const card of Object.values(catalog.cards)) pushTo(cardsByName, normalizeText(card.name), card);
  const namesByLength = new Map<number, [string, Card[]][]>();
  for (const entry of cardsByName) pushTo(namesByLength, entry[0].length, entry);
  return {
    catalog,
    printingsByTcgplayerId,
    printingsBySetNumber,
    cardsByName,
    namesByLength,
    setIdByName: indexSets(catalog),
  };
}

const cache = new WeakMap<Catalog, CatalogIndex>();

/** Catalogs are treated as immutable, so the index is cached per object. */
export function getCatalogIndex(catalog: Catalog): CatalogIndex {
  let index = cache.get(catalog);
  if (!index) {
    index = buildIndex(catalog);
    cache.set(catalog, index);
  }
  return index;
}

/** Printings of a card concept in a stable order. */
export function printingsOfCard(index: CatalogIndex, card: Card): Printing[] {
  return card.printingKeys
    .map((key) => index.catalog.printings[key])
    .filter((printing): printing is Printing => printing !== undefined)
    .sort((a, b) => (a.printingKey < b.printingKey ? -1 : 1));
}
