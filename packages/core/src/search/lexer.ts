/** Raw tokens of the query language. Quotes are kept in `source`; interpretation happens in the parser. */
export type Token =
  | { kind: 'lparen'; negated: boolean }
  | { kind: 'rparen' }
  | { kind: 'or' }
  | { kind: 'word'; source: string; unterminatedQuote: boolean };

const OR_WORD = 'OR';
const PIPE = '|';

function isSpace(ch: string): boolean {
  return /\s/.test(ch);
}

/** Scan one word, honouring quotes. Stops at whitespace, parentheses or `|` outside quotes. */
function scanWord(input: string, start: number): { end: number; unterminated: boolean } {
  let index = start;
  let inQuote = false;
  while (index < input.length) {
    const ch = input.charAt(index);
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (isSpace(ch) || ch === '(' || ch === ')' || ch === PIPE)) break;
    index++;
  }
  return { end: index, unterminated: inQuote };
}

/** Split the query into tokens. Never throws. */
export function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const ch = input.charAt(index);
    if (isSpace(ch)) {
      index++;
    } else if (ch === '(') {
      tokens.push({ kind: 'lparen', negated: false });
      index++;
    } else if (ch === '-' && input.charAt(index + 1) === '(') {
      tokens.push({ kind: 'lparen', negated: true });
      index += 2;
    } else if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      index++;
    } else if (ch === PIPE) {
      tokens.push({ kind: 'or' });
      index++;
    } else {
      const { end, unterminated } = scanWord(input, index);
      const source = input.slice(index, end);
      tokens.push(
        source === OR_WORD ? { kind: 'or' } : { kind: 'word', source, unterminatedQuote: unterminated },
      );
      index = end;
    }
  }
  return tokens;
}
