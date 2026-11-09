/** Lowercase, strip accents and apostrophes, collapse everything else non-alphanumeric to single spaces. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019\u2018`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance, giving up early: returns a value greater than `maxDistance` as soon as the
 * distance is known to exceed it. Cost is O(maxDistance * length) instead of O(length^2).
 */
export function editDistance(a: string, b: string, maxDistance = Number.MAX_SAFE_INTEGER): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/** Edits allowed between two strings of these lengths for a similarity of at least `minSimilarity`. */
export function allowedEdits(a: string, b: string, minSimilarity: number): number {
  return Math.floor((1 - minSimilarity) * Math.max(a.length, b.length));
}

/** 1 for identical strings, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

/** Similarity if it reaches `minSimilarity`, otherwise null, without computing the full distance. */
export function similarityAtLeast(a: string, b: string, minSimilarity: number): number | null {
  const allowed = allowedEdits(a, b, minSimilarity);
  const distance = editDistance(a, b, allowed);
  if (distance > allowed) return null;
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - distance / longest;
}

/** Split `Name (Alternate Art)` into the base name and the parenthetical texts. Single linear pass. */
export function splitParentheticals(value: string): { base: string; extras: string[] } {
  const extras: string[] = [];
  const kept: string[] = [];
  let position = 0;
  for (;;) {
    const open = value.indexOf('(', position);
    const close = open === -1 ? -1 : value.indexOf(')', open + 1);
    if (close === -1) break;
    kept.push(value.slice(position, open), ' ');
    extras.push(value.slice(open + 1, close));
    position = close + 1;
  }
  kept.push(value.slice(position));
  return { base: kept.join('').replace(/\s+/g, ' ').trim(), extras };
}
