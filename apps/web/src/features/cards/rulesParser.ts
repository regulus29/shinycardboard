/**
 * Parser for card rules text from the catalog. Real markup seen in the data:
 *  - bracketed keywords: `[Action]`, `[Assault 2]`, `[Empowered]`
 *  - the arrow `[>]`
 *  - inline tokens: `:rb_energy_N:`, `:rb_rune_<domain|rainbow>:`, `:rb_might:`, `:rb_exhaust:`
 *  - parentheses for reminder text (may contain tokens)
 *  - newlines between paragraphs
 * Anything else, including unknown `:rb_...:` tokens, stays plain text. Parsing never throws.
 */

export type RuneKind = 'fury' | 'calm' | 'mind' | 'body' | 'chaos' | 'order' | 'rainbow';

export type RulesSegment =
  | { kind: 'text'; text: string }
  | { kind: 'keyword'; label: string }
  | { kind: 'arrow' }
  | { kind: 'energy'; amount: number }
  | { kind: 'might' }
  | { kind: 'exhaust' }
  | { kind: 'rune'; rune: RuneKind }
  | { kind: 'reminder'; children: RulesSegment[] };

export type RulesBlock = RulesSegment[];

const RUNES: readonly string[] = ['fury', 'calm', 'mind', 'body', 'chaos', 'order', 'rainbow'];

/** One token per match: a `:rb_..:` icon, an arrow, a bracketed keyword, or a parenthesis. */
const TOKEN = /:rb_([a-z0-9_]+):|\[>\]|\[([^\]\n]+)\]|([()])/g;

function iconSegment(name: string): RulesSegment | null {
  if (name === 'might') return { kind: 'might' };
  if (name === 'exhaust') return { kind: 'exhaust' };
  const energy = /^energy_(\d+)$/.exec(name);
  if (energy) return { kind: 'energy', amount: Number(energy[1]) };
  const rune = /^rune_([a-z]+)$/.exec(name);
  if (rune && RUNES.includes(rune[1] ?? '')) return { kind: 'rune', rune: rune[1] as RuneKind };
  return null;
}

function pushText(target: RulesSegment[], text: string) {
  if (!text) return;
  const last = target[target.length - 1];
  if (last?.kind === 'text') last.text += text;
  else target.push({ kind: 'text', text });
}

/** Parse one line. Parentheses nest into reminder groups; an unclosed one runs to the end of the line. */
function parseLine(line: string): RulesBlock {
  const root: RulesSegment[] = [];
  const stack: RulesSegment[][] = [root];
  const top = () => stack[stack.length - 1] as RulesSegment[];
  let cursor = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    pushText(top(), line.slice(cursor, index));
    cursor = index + match[0].length;
    if (match[3] === '(') {
      const children: RulesSegment[] = [];
      top().push({ kind: 'reminder', children });
      stack.push(children);
    } else if (match[3] === ')') {
      if (stack.length > 1) stack.pop();
      else pushText(top(), ')');
    } else if (match[2] !== undefined) {
      top().push({ kind: 'keyword', label: match[2].trim() });
    } else if (match[1] !== undefined) {
      const icon = iconSegment(match[1]);
      if (icon) top().push(icon);
      else pushText(top(), match[0]);
    } else {
      top().push({ kind: 'arrow' });
    }
  }
  pushText(top(), line.slice(cursor));
  return root;
}

/** Split into paragraph blocks (one per non-empty line) and parse each. */
export function parseRulesText(text: string): RulesBlock[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine);
}

/** Plain-text reading of a block, for tooltips and accessible names. */
export function rulesPlainText(blocks: readonly RulesBlock[]): string {
  const flat = (segments: RulesBlock): string =>
    segments
      .map((segment) => {
        switch (segment.kind) {
          case 'text':
            return segment.text;
          case 'keyword':
            return `[${segment.label}]`;
          case 'arrow':
            return '>';
          case 'energy':
            return `${segment.amount} energy`;
          case 'might':
            return 'might';
          case 'exhaust':
            return 'exhaust';
          case 'rune':
            return `${segment.rune} rune`;
          case 'reminder':
            return `(${flat(segment.children)})`;
        }
      })
      .join('');
  return blocks.map(flat).join('\n');
}
