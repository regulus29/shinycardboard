/**
 * Spreadsheet formula injection guard. Free text cells that start with a formula trigger get a
 * leading apostrophe on export. Cells that already start with apostrophes before a trigger get one
 * more, so stripping exactly one on import restores every value.
 */
const TRIGGER_AFTER_QUOTES = /^'*[=+\-@\t\r]/;
const ESCAPED = /^'('*[=+\-@\t\r])/;

export function escapeFormula(value: string): string {
  return TRIGGER_AFTER_QUOTES.test(value) ? `'${value}` : value;
}

export function unescapeFormula(value: string): string {
  return value.replace(ESCAPED, '$1');
}
