import type { Catalog, Deck, OwnedEntry, UserData } from '../types';

export interface ImportRowIssue {
  line: number;
  raw: string;
  message: string;
}

export interface CollectionImportResult {
  entries: OwnedEntry[];
  issues: ImportRowIssue[];
  /** Rows that matched a printing by looser criteria than an exact id. */
  fuzzyMatched: number;
}

/**
 * Parse a collection CSV. Must accept: this app's own export, and TCGplayer collection
 * exports (match on tcgplayer_id first, then set code plus number, then name).
 * Tolerant of BOM, quoted fields, CRLF, and extra columns.
 */
export function parseCollectionCsv(_text: string, _catalog: Catalog, _now: number): CollectionImportResult {
  throw new Error('not implemented');
}

export function exportCollectionCsv(_owned: OwnedEntry[], _catalog: Catalog): string {
  throw new Error('not implemented');
}

/** Merge imported rows into existing entries by (printingKey, finish, condition). */
export function mergeImportedEntries(
  _existing: OwnedEntry[],
  _imported: OwnedEntry[],
  _mode: 'add' | 'replace',
  _now: number,
): OwnedEntry[] {
  throw new Error('not implemented');
}

/** Full backup as a JSON string, versioned. */
export function exportBackup(_data: UserData): string {
  throw new Error('not implemented');
}

export function importBackup(_json: string): { data: UserData } | { error: string } {
  throw new Error('not implemented');
}

/** Deck list text, one `3 Card Name` per line with section headings (Legend, Main, Runes, Battlefields, Sideboard). */
export function formatDeckText(_deck: Deck, _catalog: Catalog): string {
  throw new Error('not implemented');
}

export function parseDeckText(
  _text: string,
  _catalog: Catalog,
  _now: number,
): { deck: Deck; unmatched: string[] } {
  throw new Error('not implemented');
}
