import { normalizeText } from './text';

export type CsvField =
  | 'printingKey'
  | 'tcgplayerId'
  | 'quantity'
  | 'name'
  | 'set'
  | 'number'
  | 'finish'
  | 'condition'
  | 'variant'
  | 'notes';

/**
 * Accepted header names per field, normalized (lowercase words). Order is priority: when several
 * columns map to one field, earlier aliases are tried first.
 */
export const HEADER_ALIASES: Readonly<Record<CsvField, readonly string[]>> = {
  printingKey: ['printing key', 'printingkey'],
  tcgplayerId: ['tcgplayer id', 'tcgplayerid', 'tcg player id', 'tcgplayer product id', 'product id'],
  // Total Quantity first; a blank one falls through to Add to Quantity.
  quantity: ['quantity', 'qty', 'count', 'total quantity', 'add to quantity', 'owned', 'amount'],
  name: ['name', 'card name', 'product name', 'simple name', 'card', 'title'],
  set: ['set code', 'setcode', 'set id', 'set', 'set name', 'expansion'],
  number: ['number', 'card number', 'collector number', 'card no', 'no'],
  finish: ['finish', 'printing', 'foil', 'foiling', 'is foil'],
  condition: ['condition', 'card condition'],
  variant: ['variant', 'variant label', 'version'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

/** Header sets that identify a producer, checked in order. */
export const FORMAT_MARKERS: readonly { format: CsvFormat; headers: readonly string[] }[] = [
  { format: 'shinycardboard', headers: ['printing key', 'printingkey'] },
  { format: 'tcgplayer', headers: ['simple name', 'product id', 'tcgplayer id', 'tcgplayerid', 'tcg player id', 'add to quantity', 'total quantity'] },
];

export type CsvFormat = 'shinycardboard' | 'tcgplayer' | 'generic';

/** Column indexes per field, in alias priority order. */
export type ColumnMap = Partial<Record<CsvField, number[]>>;

/** Header text to its normalized lookup form. "Card #" and "Card Number" both become "card number". */
export function normalizeHeader(header: string): string {
  return normalizeText(header.replace(/#/g, ' number '));
}

export function mapColumns(headerCells: string[]): ColumnMap {
  // Index header positions by name once, so wide or repetitive headers stay linear.
  const positions = new Map<string, number[]>();
  headerCells.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    const list = positions.get(name);
    if (list) list.push(index);
    else positions.set(name, [index]);
  });
  const map: ColumnMap = {};
  for (const field of Object.keys(HEADER_ALIASES) as CsvField[]) {
    const seen = new Set<number>();
    for (const alias of HEADER_ALIASES[field]) {
      for (const index of positions.get(alias) ?? []) seen.add(index);
    }
    if (seen.size > 0) map[field] = [...seen];
  }
  return map;
}

export function detectFormat(headerCells: string[]): CsvFormat {
  const normalized = new Set(headerCells.map(normalizeHeader));
  const marker = FORMAT_MARKERS.find((m) => m.headers.some((header) => normalized.has(header)));
  return marker?.format ?? 'generic';
}

/** Header names for the export, in column order. */
export const EXPORT_COLUMNS: readonly { field: CsvField; header: string }[] = [
  { field: 'printingKey', header: 'Printing Key' },
  { field: 'set', header: 'Set' },
  { field: 'number', header: 'Number' },
  { field: 'name', header: 'Name' },
  { field: 'variant', header: 'Variant' },
  { field: 'finish', header: 'Finish' },
  { field: 'condition', header: 'Condition' },
  { field: 'quantity', header: 'Quantity' },
  { field: 'notes', header: 'Notes' },
  { field: 'tcgplayerId', header: 'TCGplayer Id' },
];
