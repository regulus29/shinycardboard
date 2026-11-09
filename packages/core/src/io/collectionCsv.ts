import type { Catalog, Condition, Finish, OwnedEntry } from '../types';
import { getCatalogIndex, type CatalogIndex } from './catalogIndex';
import {
  CONDITION_ALIASES,
  FINISH_ALIASES,
  FOIL_WORD,
  IO_CONFIG,
} from './config';
import { formatCsv, parseCsv, sniffDelimiter, type CsvRecord } from './csv';
import { newRecordId, ownedEntryKey } from './entries';
import {
  EXPORT_COLUMNS,
  detectFormat,
  mapColumns,
  type ColumnMap,
  type CsvField,
  type CsvFormat,
} from './headers';
import { matchPrinting, newFuzzySession, type FuzzySession, type PrintingRef } from './matcher';
import { escapeFormula, unescapeFormula } from './sheetSafe';
import { normalizeText } from './text';

export interface ImportRowIssue {
  /** 1-based line in the source file where the row starts. */
  line: number;
  raw: string;
  message: string;
  /** Errors skip the row. Warnings import the row with a default or a guess. */
  severity: 'error' | 'warning';
}

export interface CollectionImportResult {
  entries: OwnedEntry[];
  issues: ImportRowIssue[];
  /** Rows that matched a printing by looser criteria than an exact id. */
  fuzzyMatched: number;
  format: CsvFormat;
  /** Data rows seen, excluding the header and blank lines. */
  rowsRead: number;
}

/** Fields exported with a formula guard. */
const FREE_TEXT_FIELDS: readonly CsvField[] = ['name', 'variant', 'notes'];

/** Fields whose length is capped; notes are truncated instead of rejected. */
const CAPPED_FIELDS: readonly CsvField[] = ['printingKey', 'tcgplayerId', 'name', 'set', 'number', 'variant', 'finish', 'condition', 'quantity'];

/** A data row with its cells addressable by field. */
class RowView {
  constructor(
    private readonly cells: string[],
    private readonly columns: ColumnMap,
  ) {}

  /** All non-empty values for a field, in alias priority order. */
  values(field: CsvField): string[] {
    const raw = (this.columns[field] ?? []).map((i) => this.cells[i] ?? '').filter((v) => v.trim() !== '');
    // Notes are free text, so keep their spacing; everything else is an identifier or enum.
    const cleaned = field === 'notes' ? raw : raw.map((v) => v.trim());
    return FREE_TEXT_FIELDS.includes(field) ? cleaned.map(unescapeFormula) : cleaned;
  }

  first(field: CsvField): string | undefined {
    return this.values(field)[0];
  }

  has(field: CsvField): boolean {
    return this.columns[field] !== undefined;
  }
}

function emptyResult(format: CsvFormat, issues: ImportRowIssue[]): CollectionImportResult {
  return { entries: [], issues, fuzzyMatched: 0, format, rowsRead: 0 };
}

const preview = (raw: string): string =>
  raw.length > IO_CONFIG.maxRawPreviewChars ? `${raw.slice(0, IO_CONFIG.maxRawPreviewChars)}...` : raw;

const issueAt = (record: CsvRecord, severity: ImportRowIssue['severity'], message: string): ImportRowIssue => ({
  line: record.line,
  raw: preview(record.raw),
  message,
  severity,
});

const DELIMITER_NAMES: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

function noHeaderIssue(first: CsvRecord | undefined, delimiter: string): ImportRowIssue {
  if (!first) return { line: 1, raw: '', message: 'The file is empty', severity: 'error' };
  const message =
    `No recognizable header row (read as ${DELIMITER_NAMES[delimiter] ?? 'comma'} separated). ` +
    'Expected columns such as Quantity, Name, Set, Number or TCGplayer Id';
  return issueAt(first, 'error', message);
}

const RECOGNIZED_IDENTITY_FIELDS: readonly CsvField[] = ['printingKey', 'tcgplayerId', 'name', 'number'];

/** First of the leading rows that looks like a header: enough recognized columns including an identity column. */
function findHeader(records: CsvRecord[]): { position: number; columns: ColumnMap } | null {
  for (let position = 0; position < Math.min(records.length, IO_CONFIG.headerScanRows); position++) {
    const columns = mapColumns(records[position]!.cells);
    const matched = Object.keys(columns).length;
    const hasIdentity = RECOGNIZED_IDENTITY_FIELDS.some((field) => columns[field] !== undefined);
    if (matched >= IO_CONFIG.minHeaderMatches && hasIdentity) return { position, columns };
  }
  return null;
}

const QUANTITY_PATTERN = /^x?\s*(\d+)\s*x?$/i;

interface ConditionCell {
  condition: Condition;
  /** Set when the cell was like "Near Mint Foil". */
  foil: boolean;
  warning?: string;
}

function describeBadQuantity(raw: string): string {
  const text = raw.trim();
  if (/^-/.test(text)) return `Quantity "${raw}" is negative; use a whole number of at least 1`;
  if (/^[0-9.]+e[+-]?[0-9]+$/i.test(text)) return `Quantity "${raw}" is in scientific notation; write the full number`;
  if (/^[0-9]+[.,][0-9]+$/.test(text)) return `Quantity "${raw}" is not a whole number`;
  return `Quantity "${raw}" is not a number`;
}

type Parsed<T> = { value: T } | { error: string };

function parseQuantity(row: RowView): Parsed<number> {
  if (!row.has('quantity')) return { value: 1 };
  const raw = row.first('quantity');
  if (raw === undefined) return { error: 'Missing quantity' };
  const match = QUANTITY_PATTERN.exec(raw.trim());
  if (!match) return { error: describeBadQuantity(raw) };
  const quantity = Number(match[1]);
  if (quantity <= 0) return { error: `Quantity "${raw}" must be at least 1` };
  if (quantity > IO_CONFIG.maxQuantity) return { error: `Quantity ${quantity} exceeds ${IO_CONFIG.maxQuantity}` };
  return { value: quantity };
}

function parseCondition(raw: string | undefined): ConditionCell {
  if (raw === undefined) return { condition: IO_CONFIG.defaultCondition, foil: false };
  const words = normalizeText(raw).split(' ');
  const foil = words.includes(FOIL_WORD);
  const cleaned = words.filter((word) => word !== FOIL_WORD).join(' ');
  if (cleaned === '') return { condition: IO_CONFIG.defaultCondition, foil };
  const condition = CONDITION_ALIASES[cleaned];
  if (condition) return { condition, foil };
  return {
    condition: IO_CONFIG.defaultCondition,
    foil,
    warning: `Unknown condition "${raw}"; assumed ${IO_CONFIG.defaultCondition}`,
  };
}

function parseFinish(raw: string | undefined, foilFromCondition: boolean): { finish: Finish; warning?: string } {
  if (raw === undefined) return { finish: foilFromCondition ? 'foil' : IO_CONFIG.defaultFinish };
  const finish = FINISH_ALIASES[normalizeText(raw)];
  if (finish) return { finish: foilFromCondition ? 'foil' : finish };
  return {
    finish: foilFromCondition ? 'foil' : IO_CONFIG.defaultFinish,
    warning: `Unknown finish "${raw}"; assumed ${IO_CONFIG.defaultFinish}`,
  };
}

function buildRef(row: RowView): PrintingRef {
  return {
    printingKey: row.first('printingKey'),
    tcgplayerId: row.first('tcgplayerId'),
    setValues: row.values('set'),
    number: row.first('number'),
    names: row.values('name'),
    hintText: [...row.values('name'), ...row.values('variant')].join(' '),
  };
}

function hasIdentity(ref: PrintingRef): boolean {
  return Boolean(ref.printingKey || ref.tcgplayerId || ref.names.length > 0 || ref.number);
}

/** Build the entry for one data row, or explain why not. Warnings ride along. */
function rowToEntry(
  row: RowView,
  index: CatalogIndex,
  session: FuzzySession,
  now: number,
): { entry: OwnedEntry; warnings: string[]; fuzzy: boolean } | { error: string } {
  const tooLong = CAPPED_FIELDS.find((field) => row.values(field).some((v) => v.length > IO_CONFIG.maxFieldChars));
  if (tooLong) return { error: `The ${tooLong} value is longer than ${IO_CONFIG.maxFieldChars} characters` };
  const quantity = parseQuantity(row);
  if ('error' in quantity) return { error: quantity.error };
  const ref = buildRef(row);
  if (!hasIdentity(ref)) return { error: 'Row has no card identifier (id, name or set and number)' };
  const match = matchPrinting(ref, index, session);
  if (!match) return { error: `No matching card for ${describeRef(ref)}` };

  const condition = parseCondition(row.first('condition'));
  const finish = parseFinish(row.first('finish'), condition.foil);
  const warnings = [condition.warning, finish.warning, match.fuzzy ? match.note : undefined].filter(
    (w): w is string => w !== undefined,
  );
  const entry: OwnedEntry = {
    id: newRecordId(),
    updatedAt: now,
    printingKey: match.printing.printingKey,
    finish: finish.finish,
    condition: condition.condition,
    quantity: quantity.value,
  };
  const notes = row.first('notes');
  if (notes !== undefined) {
    entry.notes = notes.slice(0, IO_CONFIG.maxNotesChars);
    if (notes.length > IO_CONFIG.maxNotesChars) warnings.push(`Notes were cut to ${IO_CONFIG.maxNotesChars} characters`);
  }
  return { entry, warnings, fuzzy: match.fuzzy };
}

function describeRef(ref: PrintingRef): string {
  const parts = [
    ref.printingKey && `printing key "${ref.printingKey}"`,
    ref.tcgplayerId && `TCGplayer id ${ref.tcgplayerId}`,
    ref.names[0] && `"${ref.names[0]}"`,
    ref.number && `number ${ref.number}`,
  ].filter(Boolean);
  return parts.join(', ');
}

/** Same key rows (for example one printing listed twice) fold into one entry with summed quantity. */
function accumulate(into: Map<string, OwnedEntry>, entry: OwnedEntry): void {
  const key = ownedEntryKey(entry);
  const current = into.get(key);
  if (!current) {
    into.set(key, entry);
    return;
  }
  current.quantity += entry.quantity;
  if (current.notes === undefined && entry.notes !== undefined) current.notes = entry.notes;
}

/**
 * Parse a collection CSV: this app's own export, TCGplayer collection exports, or any CSV whose
 * headers match the alias table in headers.ts. Never throws; problems come back as issues.
 */
export function parseCollectionCsv(text: string, catalog: Catalog, now: number): CollectionImportResult {
  if (text.length > IO_CONFIG.maxInputChars) {
    const message = `The file is larger than ${IO_CONFIG.maxInputChars} characters; split it and import the parts`;
    return emptyResult('generic', [{ line: 1, raw: '', message, severity: 'error' }]);
  }
  const delimiter = sniffDelimiter(text);
  const { records, unterminatedQuote } = parseCsv(text, delimiter);
  const issues: ImportRowIssue[] = [];
  const header = findHeader(records);
  if (!header) {
    return emptyResult('generic', [noHeaderIssue(records[0], delimiter)]);
  }

  const headerRecord = records[header.position]!;
  const format = detectFormat(headerRecord.cells);
  if (!header.columns.quantity) issues.push(issueAt(headerRecord, 'warning', 'No quantity column; assuming 1 per row'));

  const index = getCatalogIndex(catalog);
  const session = newFuzzySession();
  const entries = new Map<string, OwnedEntry>();
  const allData = records.slice(header.position + 1);
  const dataRecords = allData.slice(0, IO_CONFIG.maxRows);
  if (allData.length > dataRecords.length) {
    const skipped = allData.length - dataRecords.length;
    issues.push(issueAt(allData[dataRecords.length]!, 'error', `Row limit of ${IO_CONFIG.maxRows} reached; ${skipped} further rows were ignored`));
  }
  let fuzzyMatched = 0;

  for (const record of dataRecords) {
    const result = rowToEntry(new RowView(record.cells, header.columns), index, session, now);
    if ('error' in result) {
      issues.push(issueAt(record, 'error', result.error));
      continue;
    }
    for (const warning of result.warnings) issues.push(issueAt(record, 'warning', warning));
    if (result.fuzzy) fuzzyMatched++;
    accumulate(entries, result.entry);
  }
  if (session.exhausted) {
    const message = `Fuzzy name matching stopped after ${IO_CONFIG.maxFuzzyLookups} distinct names; later unknown names were not fuzzy matched`;
    issues.push(issueAt(headerRecord, 'warning', message));
  }
  if (unterminatedQuote) {
    const last = records[records.length - 1]!;
    issues.push(issueAt(last, 'warning', 'A quoted field was never closed; the rest of the file was read as part of it'));
  }
  return { entries: [...entries.values()], issues, fuzzyMatched, format, rowsRead: dataRecords.length };
}

function exportValue(field: CsvField, entry: OwnedEntry, catalog: Catalog): string {
  const printing = catalog.printings[entry.printingKey];
  const card = printing ? catalog.cards[printing.cardKey] : undefined;
  const values: Record<CsvField, string | undefined> = {
    printingKey: entry.printingKey,
    set: printing?.setId.toUpperCase(),
    number: printing ? String(printing.collectorNumber).padStart(3, '0') : undefined,
    name: card?.name,
    variant: printing?.variantLabel ?? (printing && printing.variant !== 'standard' ? printing.variant : undefined),
    finish: entry.finish,
    condition: entry.condition,
    quantity: String(entry.quantity),
    notes: entry.notes,
    tcgplayerId: printing?.tcgplayerId ?? undefined,
  };
  const value = values[field] ?? '';
  return FREE_TEXT_FIELDS.includes(field) ? escapeFormula(value) : value;
}

/** Export live rows in input order. Re-importing the file reproduces the entries (ids and timestamps aside). */
export function exportCollectionCsv(owned: OwnedEntry[], catalog: Catalog): string {
  const header = EXPORT_COLUMNS.map((column) => column.header);
  const rows = owned
    .filter((entry) => entry.deleted !== true && entry.quantity > 0)
    .map((entry) => EXPORT_COLUMNS.map((column) => exportValue(column.field, entry, catalog)));
  return formatCsv([header, ...rows]);
}
