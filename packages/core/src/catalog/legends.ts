import type { Prepared } from './prepare';
import { slugify } from './slug';

/** Separator between champion and legend title in full legend names ("Vi - Piltover Enforcer"). */
const TITLE_SEPARATOR = ' - ';

/** The legend title: the part after the champion, or the whole name when there is no champion part. */
export function legendTitle(baseName: string): string {
  return baseName.split(TITLE_SEPARATOR).pop() ?? baseName;
}

/**
 * "Yordle, Kennen - Heart of the Tempest" lists a descriptor before the champion; display and
 * sort it as "Kennen - Heart of the Tempest". Names without a champion part are unchanged.
 */
export function normalizeLegendName(baseName: string): string {
  const index = baseName.indexOf(TITLE_SEPARATOR);
  if (index < 0) return baseName;
  const champion = baseName.slice(0, index).split(', ').pop() ?? '';
  return `${champion.trim()}${baseName.slice(index)}`;
}

function isFullName(baseName: string): boolean {
  return baseName.includes(TITLE_SEPARATOR);
}

/** Prefer the form that names the champion; among those, the most common, then the longest. */
function pickCanonicalName(members: Prepared[]): string {
  const counts = new Map<string, number>();
  for (const member of members) counts.set(member.baseName, (counts.get(member.baseName) ?? 0) + 1);
  const names = [...counts.keys()].sort(
    (a, b) =>
      Number(isFullName(b)) - Number(isFullName(a)) ||
      (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
      b.length - a.length ||
      a.localeCompare(b),
  );
  return names[0] as string;
}

/**
 * The source records some Legends both as "Champion - Title" and as just "Title" (stale legacy
 * entries and overnumbered printings). Legend titles are unique, so group legends by title and
 * give every member the champion-qualified name. Other card types are untouched.
 */
export function unifyLegendNames(items: Prepared[]): Prepared[] {
  const byTitle = new Map<string, Prepared[]>();
  const normalized = new Map<Prepared, Prepared>();
  for (const item of items) {
    if (item.type !== 'Legend') continue;
    const copy = { ...item, baseName: normalizeLegendName(item.baseName) };
    normalized.set(item, copy);
    const key = slugify(legendTitle(copy.baseName));
    byTitle.set(key, [...(byTitle.get(key) ?? []), copy]);
  }
  const canonicalByCopy = new Map<Prepared, string>();
  for (const members of byTitle.values()) {
    const name = pickCanonicalName(members);
    for (const member of members) canonicalByCopy.set(member, name);
  }
  return items.map((item) => {
    const copy = normalized.get(item);
    const baseName = copy ? canonicalByCopy.get(copy) : undefined;
    return baseName === undefined || baseName === item.baseName ? item : { ...item, baseName, nameSlug: slugify(baseName) };
  });
}
