import type { Catalog } from '../types';
import { foldText, tokenize } from './fold';
import type { PhraseTarget } from './types';

/** Label words that name no set in particular, so they never stand alone as a set alias. */
const GENERIC_SET_WORDS: ReadonlySet<string> = new Set(['riftbound', 'cards', 'card', 'play', 'promotional']);
/** Nicknames: alias to the label word it stands for. */
const SET_NICKNAMES: Readonly<Record<string, string>> = { promo: 'promotional', promos: 'promotional' };
/** Longest sub-phrase of a set title that is accepted as an alias, in words. */
const MAX_TITLE_PHRASE_WORDS = 4;
const MIN_TITLE_PHRASE_WORDS = 2;

type SetSpec = Catalog['sets'][number];

function setTarget(sets: string[], orName: boolean): PhraseTarget {
  return { kind: 'facets', facets: [{ field: 'set', values: sets }], orName, isSet: true };
}

function addAlias(aliases: Map<string, Set<string>>, alias: string, setId: string): void {
  const set = aliases.get(alias) ?? new Set<string>();
  set.add(setId);
  aliases.set(alias, set);
}

/** Contiguous word runs of a title, for example "proving grounds" from "Proving Grounds". */
function titlePhrases(words: string[]): string[] {
  const phrases: string[] = [];
  for (let start = 0; start < words.length; start++) {
    for (let length = MIN_TITLE_PHRASE_WORDS; length <= MAX_TITLE_PHRASE_WORDS && start + length <= words.length; length++) {
      const run = words.slice(start, start + length);
      if (run.some((word) => !GENERIC_SET_WORDS.has(word))) phrases.push(run.join(' '));
    }
  }
  return phrases;
}

/**
 * Every way a player might name a set: its code, its title, runs of title words
 * ("organized play"), distinctive title words ("origins", "unleashed") and nicknames ("promo").
 * Codes and full phrases only filter; single title words also match card names, because a
 * card such as "Kayn - Unleashed" shares the word with the set.
 */
export function buildSetPhrases(sets: SetSpec[]): Map<string, PhraseTarget> {
  const codes = new Map<string, Set<string>>();
  const phrases = new Map<string, Set<string>>();
  const words = new Map<string, Set<string>>();
  for (const set of sets) {
    const id = set.setId.toLowerCase();
    addAlias(codes, id, id);
    const titleWords = tokenize(set.label);
    if (titleWords.length >= MIN_TITLE_PHRASE_WORDS) addAlias(phrases, titleWords.join(" "), id);
    for (const phrase of titlePhrases(titleWords)) addAlias(phrases, phrase, id);
    for (const word of titleWords) addAlias(words, word, id);
  }
  const result = new Map<string, PhraseTarget>();
  for (const [word, ids] of words) {
    if (!GENERIC_SET_WORDS.has(word)) result.set(word, setTarget([...ids], true));
  }
  for (const [nickname, word] of Object.entries(SET_NICKNAMES)) {
    const ids = words.get(word);
    if (ids) result.set(nickname, setTarget([...ids], true));
  }
  for (const [phrase, ids] of phrases) result.set(phrase, setTarget([...ids], false));
  for (const [code, ids] of codes) result.set(code, setTarget([...ids], false));
  return result;
}

/** Labels of one-off printings (Starter, Ultimate, Launch Exclusive, GG EZ) as bare variant words. */
export function buildVariantLabelPhrases(catalog: Catalog): Map<string, PhraseTarget> {
  const result = new Map<string, PhraseTarget>();
  for (const printing of Object.values(catalog.printings)) {
    if (printing.variant !== 'other' || !printing.variantLabel) continue;
    const label = foldText(printing.variantLabel);
    result.set(label, { kind: 'facets', facets: [{ field: 'variant', values: [label] }], orName: true, isSet: false });
  }
  return result;
}
