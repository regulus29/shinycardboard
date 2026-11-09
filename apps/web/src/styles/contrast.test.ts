import { readSource } from '../test/readSource';
import { describe, expect, it } from 'vitest';

/** WCAG contrast guard: every token pair used for text or controls must stay accessible in both themes. */

type Rgba = [number, number, number, number];
const css = readSource('src/styles/tokens.css');

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[name!] = value!.trim();
  return out;
}

function blockFor(selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('\n}', open));
}

const dark = declarations(blockFor(':root {'));
const light = { ...dark, ...declarations(blockFor(":root[data-theme='light']")) };

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`Unsupported color token value: ${value}`);
}

const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)).concat(1) as Rgba;
};

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const SURFACES = ['--bg-app', '--bg-surface', '--bg-raised', '--bg-overlay'];
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

interface Pair {
  fg: string;
  bg: string;
  min: number;
  /** Composite foreground (and background) over this surface first. */
  base?: string;
}

const pairs: Pair[] = [
  ...['--text', '--text-muted', '--text-faint', '--accent-text'].flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: TEXT_MIN }))),
  ...['--accent', '--accent-hover', '--accent-press'].map((bg) => ({ fg: '--on-accent', bg, min: TEXT_MIN })),
  ...['--success', '--warning', '--danger', '--info'].flatMap((fg) =>
    ['--bg-surface', '--bg-raised', '--bg-overlay'].map((bg) => ({ fg, bg, min: TEXT_MIN })),
  ),
  // Badge text on its own tinted background, drawn over a surface.
  ...['success', 'warning', 'danger', 'info'].map((tone) => ({ fg: `--${tone}`, bg: `--${tone}-soft`, min: TEXT_MIN, base: '--bg-surface' })),
  // Hover, pressed and active states paint a translucent overlay over any surface.
  ...['--text', '--text-muted', '--text-faint'].flatMap((fg) =>
    ['--bg-hover', '--bg-active'].flatMap((bg) => SURFACES.map((base) => ({ fg, bg, base, min: TEXT_MIN }))),
  ),
  ...SURFACES.map((base) => ({ fg: '--accent-text', bg: '--accent-soft', base, min: TEXT_MIN })),
  { fg: '--text-muted', bg: '--bg-active', min: TEXT_MIN, base: '--bg-surface' },
  ...['common', 'uncommon', 'rare', 'epic', 'showcase', 'promo'].flatMap((r) =>
    ['--bg-surface', '--bg-raised'].map((bg) => ({ fg: `--rarity-${r}`, bg, min: TEXT_MIN })),
  ),
  ...['fury', 'calm', 'mind', 'body', 'chaos', 'order', 'colorless'].flatMap((d) =>
    ['--bg-surface', '--bg-raised'].map((bg) => ({ fg: `--domain-${d}`, bg, min: NON_TEXT_MIN })),
  ),
  ...['--bg-app', '--bg-surface', '--bg-raised'].map((bg) => ({ fg: '--control-border', bg, min: NON_TEXT_MIN })),
  ...['--bg-app', '--bg-surface'].map((bg) => ({ fg: '--accent', bg, min: NON_TEXT_MIN })),
];

describe.each([
  ['dark', dark],
  ['light', light],
] as const)('%s theme contrast', (_name, tokens) => {
  it.each(pairs.map((pair) => [`${pair.fg} on ${pair.bg}${pair.base ? ` over ${pair.base}` : ''}`, pair] as const))('%s', (_label, pair) => {
    const base = pair.base ? parseColor(tokens[pair.base]!) : undefined;
    const bg = parseColor(tokens[pair.bg]!);
    const solidBg = base ? over(bg, base) : bg;
    const fg = parseColor(tokens[pair.fg]!);
    const solidFg = over(fg, solidBg);
    expect(ratio(solidFg, solidBg)).toBeGreaterThanOrEqual(pair.min);
  });
});
