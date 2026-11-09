import { foldDiacritics } from '../catalog/slug';

/** Words shorter than this are matched exactly or by prefix only. */
export const MIN_SUBSTRING_LENGTH = 2;
/** Typo budget by word length: short words must be exact, medium allow one edit, long allow two. */
const SHORT_WORD_MAX = 3;
const MEDIUM_WORD_MAX = 7;
/** Prefix typo matching (partially typed word with a typo) needs at least this many characters. */
export const MIN_PREFIX_TYPO_LENGTH = 5;

/**
 * Lowercase, strip accents and apostrophes, and turn every other symbol into a space,
 * so "Kha'Zix" and "Tomb-Raider" fold the same way for names and for queries.
 */
export function foldText(text: string): string {
  return foldDiacritics(text)
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const folded = foldText(text);
  return folded ? folded.split(' ') : [];
}

/** Turn rules-text icons into words ("+1 :rb_might:" becomes "+1 might") before folding. */
export function foldRules(text: string): string {
  const iconsAsWords = text
    .replace(/:rb_energy_(\d+):/g, ' $1 energy ')
    .replace(/:rb_rune_(\w+):/g, ' $1 rune ')
    .replace(/:rb_(\w+):/g, ' $1 ');
  return foldText(iconsAsWords);
}

export function maxEdits(length: number): number {
  if (length <= SHORT_WORD_MAX) return 0;
  return length <= MEDIUM_WORD_MAX ? 1 : 2;
}

/**
 * Optimal string alignment distance (insert, delete, substitute, adjacent swap) with an
 * early exit: returns `limit + 1` as soon as the distance must exceed `limit`.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let beforePrevious: number[] = [];
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      const swapped = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      if (swapped) value = Math.min(value, (beforePrevious[j - 2] as number) + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length] as number;
}
