import { ownedEntryKey, parseCollectionCsv, type Catalog, type CollectionImportResult, type ImportRowIssue, type OwnedEntry } from '@sc/core';
import { MAX_OWNED_QUANTITY } from '../../config/constants';

export type SeverityFilter = 'all' | ImportRowIssue['severity'];

export interface ImportPreview {
  result: CollectionImportResult;
  /** Distinct rows ready to import. */
  rows: number;
  /** Total copies across those rows, after the quantity limit. */
  copies: number;
  /** Rows matched by exact id (everything matched except the fuzzy ones). */
  exactMatched: number;
  errors: number;
  warnings: number;
}

/** Trailing blank or delimiter-only lines (spreadsheet exports often end with one) are not data. */
export function stripTrailingBlankRows(text: string): string {
  return text.replace(/(\r?\n[\s,;\t]*)+$/, '');
}

/** Rows above the owned limit are reduced to it, with a warning, matching what applyImport stores. */
function clampEntries(result: CollectionImportResult): CollectionImportResult {
  const issues = [...result.issues];
  const entries = result.entries.map((entry) => {
    if (entry.quantity <= MAX_OWNED_QUANTITY) return entry;
    issues.push({
      line: 0,
      raw: entry.printingKey,
      severity: 'warning',
      message: `Quantity ${entry.quantity.toLocaleString()} is above the limit and will be stored as ${MAX_OWNED_QUANTITY.toLocaleString()}`,
    });
    return { ...entry, quantity: MAX_OWNED_QUANTITY };
  });
  return { ...result, entries, issues };
}

/** Parse pasted or loaded text into a preview. Never throws; a parser failure becomes a single error issue. */
export function buildImportPreview(text: string, catalog: Catalog, now: number): ImportPreview {
  let result: CollectionImportResult;
  try {
    result = clampEntries(parseCollectionCsv(stripTrailingBlankRows(text), catalog, now));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be read.';
    result = { entries: [], issues: [{ line: 1, raw: '', message, severity: 'error' }], fuzzyMatched: 0, format: 'generic', rowsRead: 0 };
  }
  const rows = result.entries.length;
  return {
    result,
    rows,
    copies: result.entries.reduce((sum, entry) => sum + entry.quantity, 0),
    exactMatched: Math.max(0, rows - result.fuzzyMatched),
    errors: result.issues.filter((issue) => issue.severity === 'error').length,
    warnings: result.issues.filter((issue) => issue.severity === 'warning').length,
  };
}

export function filterIssues(issues: readonly ImportRowIssue[], filter: SeverityFilter): ImportRowIssue[] {
  return filter === 'all' ? [...issues] : issues.filter((issue) => issue.severity === filter);
}

/** Share of imported rows whose quantity already equals what is owned: Add mode would double them. */
export function alreadyImportedShare(existing: readonly OwnedEntry[], imported: readonly OwnedEntry[]): number {
  if (imported.length === 0) return 0;
  const owned = new Map(existing.filter((entry) => !entry.deleted).map((entry) => [ownedEntryKey(entry), entry.quantity]));
  const same = imported.filter((entry) => owned.get(ownedEntryKey(entry)) === entry.quantity).length;
  return same / imported.length;
}

/** A JSON backup starts with an object; those belong to Settings, which can restore everything safely. */
export function looksLikeBackup(text: string): boolean {
  return text.trimStart().startsWith('{');
}

export const FORMAT_LABELS: Record<CollectionImportResult['format'], string> = {
  shinycardboard: 'Shiny Cardboard CSV',
  tcgplayer: 'TCGplayer CSV',
  generic: 'Generic CSV',
};
