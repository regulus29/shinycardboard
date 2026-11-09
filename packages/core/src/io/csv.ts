export interface CsvRecord {
  cells: string[];
  /** 1-based physical line where the record starts. */
  line: number;
  /** Source text of the record, for error reports. */
  raw: string;
}

export interface CsvParseResult {
  records: CsvRecord[];
  /** True when a quoted field never closed and swallowed the rest of the input. */
  unterminatedQuote: boolean;
}

const BOM = 0xfeff;

/** Delimiters tried when sniffing, in tie-break order. */
export const DELIMITERS: readonly string[] = [',', ';', '\t'];
const SNIFF_CHARS = 10_000;
const LINE_BREAKS = '\n\r';

/** Guess the delimiter from the first line: the candidate that appears most outside quotes. */
export function sniffDelimiter(input: string): string {
  const text = (input.charCodeAt(0) === BOM ? input.slice(1) : input).slice(0, SNIFF_CHARS);
  const counts = new Map(DELIMITERS.map((d): [string, number] => [d, 0]));
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (inQuotes) continue;
    else if (LINE_BREAKS.includes(ch)) break;
    else if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  return DELIMITERS.reduce((best, d) => (counts.get(d)! > counts.get(best)! ? d : best), DELIMITERS[0]!);
}

/** RFC 4180 parser: quotes, doubled quotes, embedded commas and newlines, CRLF, CR or LF, BOM. Never throws. */
export function parseCsv(input: string, delimiter = ','): CsvParseResult {
  const text = input.charCodeAt(0) === BOM ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let recordStart = 0;

  const endRecord = (end: number): void => {
    cells.push(field);
    const blank = cells.length === 1 && cells[0]!.trim() === '';
    if (!blank) records.push({ cells, line: recordLine, raw: text.slice(recordStart, end) });
    cells = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const lineBreak = ch === '\n' || (ch === '\r' && text[i + 1] !== '\n');
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
        if (lineBreak) line++;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      endRecord(i);
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      recordLine = line;
      recordStart = i + 1;
    } else {
      field += ch;
    }
  }
  if (field !== '' || cells.length > 0) endRecord(text.length);
  return { records, unterminatedQuote: inQuotes };
}

const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/;

function formatCell(value: string): string {
  return NEEDS_QUOTING.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize rows as RFC 4180 CSV with CRLF line endings and a trailing newline. */
export function formatCsv(rows: string[][]): string {
  return rows.map((row) => row.map(formatCell).join(',') + '\r\n').join('');
}
