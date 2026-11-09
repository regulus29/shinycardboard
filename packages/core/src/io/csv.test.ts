import { describe, expect, it } from 'vitest';
import { formatCsv, parseCsv } from './csv';

const cellsOf = (text: string): string[][] => parseCsv(text).records.map((r) => r.cells);

describe('parseCsv', () => {
  it('parses simple rows with LF, CRLF and CR endings', () => {
    const expected = [['a', 'b'], ['1', '2']];
    expect(cellsOf('a,b\n1,2\n')).toEqual(expected);
    expect(cellsOf('a,b\r\n1,2\r\n')).toEqual(expected);
    expect(cellsOf('a,b\r1,2')).toEqual(expected);
  });

  it('strips a BOM', () => {
    expect(cellsOf('\ufeffName,Qty\nA,1')[0]).toEqual(['Name', 'Qty']);
  });

  it('handles quotes, doubled quotes, embedded commas and newlines', () => {
    const text = 'a,b\n"x, y","say ""hi"""\n"line1\nline2",z\n';
    expect(cellsOf(text)).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
  });

  it('keeps CRLF inside quoted fields intact', () => {
    expect(cellsOf('a\r\n"x\r\ny"\r\n')[1]).toEqual(['x\r\ny']);
  });

  it('keeps empty cells and skips blank lines', () => {
    expect(cellsOf('a,b,c\n\n,,\n  \n1,,3')).toEqual([['a', 'b', 'c'], ['', '', ''], ['1', '', '3']]);
  });

  it('passes ragged rows through unchanged', () => {
    expect(cellsOf('a,b,c\n1\n1,2,3,4')).toEqual([['a', 'b', 'c'], ['1'], ['1', '2', '3', '4']]);
  });

  it('reports 1-based start lines, counting newlines inside quotes', () => {
    const { records } = parseCsv('h\n"a\nb"\nc\n\nd');
    expect(records.map((r) => [r.line, r.cells[0]])).toEqual([[1, 'h'], [2, 'a\nb'], [4, 'c'], [6, 'd']]);
  });

  it('flags an unterminated quote without throwing', () => {
    const result = parseCsv('a,b\n1,"never closed\n2,3');
    expect(result.unterminatedQuote).toBe(true);
    expect(result.records).toHaveLength(2);
  });

  it('treats stray quotes in unquoted fields literally', () => {
    expect(cellsOf('5" card,x')).toEqual([['5" card', 'x']]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('').records).toEqual([]);
  });
});

describe('formatCsv', () => {
  it('quotes only where needed and round trips through parseCsv', () => {
    const rows = [['plain', 'a,b', 'say "hi"', 'two\nlines', ' padded ', '']];
    expect(cellsOf(formatCsv(rows))).toEqual(rows);
    expect(formatCsv([['plain', 'a,b']])).toBe('plain,"a,b"\r\n');
  });
});
