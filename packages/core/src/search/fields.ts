import { CARD_TYPES, DOMAINS, KEYWORDS, RARITIES } from '../catalog/vocabulary';
import type { EnumField, Facet, NumericField, PhraseTarget, TextField, UserListField } from './types';

/** What a `field:` prefix means. Aliases are lower case. */
export type FieldSpec =
  | { kind: 'enum'; field: EnumField }
  | { kind: 'number'; field: NumericField }
  | { kind: 'text'; field: TextField }
  | { kind: 'owned' }
  | { kind: 'user'; field: UserListField };

const FIELD_TABLE: Record<string, FieldSpec> = {
  set: { kind: 'enum', field: 'set' },
  s: { kind: 'enum', field: 'set' },
  supertype: { kind: 'enum', field: 'supertype' },
  st: { kind: 'enum', field: 'supertype' },
  type: { kind: 'enum', field: 'type' },
  t: { kind: 'enum', field: 'type' },
  domain: { kind: 'enum', field: 'domain' },
  d: { kind: 'enum', field: 'domain' },
  color: { kind: 'enum', field: 'domain' },
  colour: { kind: 'enum', field: 'domain' },
  rarity: { kind: 'enum', field: 'rarity' },
  r: { kind: 'enum', field: 'rarity' },
  keyword: { kind: 'enum', field: 'keyword' },
  k: { kind: 'enum', field: 'keyword' },
  kw: { kind: 'enum', field: 'keyword' },
  variant: { kind: 'enum', field: 'variant' },
  v: { kind: 'enum', field: 'variant' },
  energy: { kind: 'number', field: 'energy' },
  cost: { kind: 'number', field: 'energy' },
  might: { kind: 'number', field: 'might' },
  power: { kind: 'number', field: 'power' },
  number: { kind: 'number', field: 'number' },
  num: { kind: 'number', field: 'number' },
  name: { kind: 'text', field: 'name' },
  n: { kind: 'text', field: 'name' },
  text: { kind: 'text', field: 'rules' },
  rules: { kind: 'text', field: 'rules' },
  o: { kind: 'text', field: 'rules' },
  artist: { kind: 'text', field: 'artist' },
  a: { kind: 'text', field: 'artist' },
  owned: { kind: 'owned' },
  own: { kind: 'owned' },
  tag: { kind: 'user', field: 'tag' },
  tags: { kind: 'user', field: 'tag' },
  deck: { kind: 'user', field: 'deck' },
  decks: { kind: 'user', field: 'deck' },
};

export function lookupField(name: string): FieldSpec | undefined {
  return FIELD_TABLE[name.toLowerCase()];
}

/** Canonical field names offered by suggestions, with a short hint. */
export const FIELD_SUGGESTIONS: readonly { name: string; hint: string }[] = [
  { name: 'set', hint: 'set code or name' },
  { name: 'type', hint: 'unit, spell, gear, legend, battlefield, rune' },
  { name: 'supertype', hint: 'champion, signature, token' },
  { name: 'domain', hint: 'fury, calm, mind, body, chaos, order' },
  { name: 'rarity', hint: 'common to epic' },
  { name: 'keyword', hint: 'rules keyword' },
  { name: 'variant', hint: 'alt, sig, over, metal' },
  { name: 'cost', hint: 'energy cost, e.g. cost:2..4' },
  { name: 'might', hint: 'might, e.g. might>=3' },
  { name: 'power', hint: 'power' },
  { name: 'text', hint: 'rules text' },
  { name: 'artist', hint: 'artist name' },
  { name: 'owned', hint: 'yes, no, foil, >2' },
  { name: 'tag', hint: 'your tags' },
  { name: 'deck', hint: 'decks that use the card' },
];

const facet = (field: EnumField, ...values: string[]): Facet => ({ field, values });
const filterWord = (...facets: Facet[]): PhraseTarget => ({ kind: 'facets', facets, orName: false, isSet: false });
const filterOrName = (...facets: Facet[]): PhraseTarget => ({ kind: 'facets', facets, orName: true, isSet: false });

/** Variant spellings people type, mapped to the variant they mean. */
const VARIANT_PHRASES: Readonly<Record<string, string>> = {
  'alternate art': 'alternate art',
  'alt art': 'alternate art',
  alt: 'alternate art',
  altart: 'alternate art',
  alternate: 'alternate art',
  overnumbered: 'overnumbered',
  overnumber: 'overnumbered',
  ovn: 'overnumbered',
  metal: 'metal',
};

function buildStaticPhrases(): Map<string, PhraseTarget> {
  const phrases = new Map<string, PhraseTarget>();
  for (const domain of DOMAINS) phrases.set(domain.toLowerCase(), filterWord(facet('domain', domain.toLowerCase())));
  for (const type of CARD_TYPES) {
    const value = type.toLowerCase();
    phrases.set(value, filterWord(facet('type', value)));
    phrases.set(`${value}s`, filterWord(facet('type', value)));
  }
  for (const rarity of RARITIES) phrases.set(rarity.toLowerCase(), filterWord(facet('rarity', rarity.toLowerCase())));
  for (const [phrase, variant] of Object.entries(VARIANT_PHRASES)) phrases.set(phrase, filterWord(facet('variant', variant)));
  // Supertypes: tokens and basics are also words in names and rules, so they keep matching those.
  phrases.set('champion', filterWord(facet('supertype', 'champion')));
  phrases.set('champions', filterWord(facet('supertype', 'champion')));
  for (const word of ['token', 'tokens']) phrases.set(word, filterOrName(facet('supertype', 'token')));
  phrases.set('basic', filterOrName(facet('supertype', 'basic')));
  // "Signature" is both a card variant and a supertype of the cards built for a champion.
  const signature = filterWord(facet('variant', 'signature'), facet('supertype', 'signature'));
  phrases.set('signature', signature);
  phrases.set('sig', signature);
  // Finish belongs to owned copies, not printings, so "foil" means "I own it in foil".
  phrases.set('foil', { kind: 'owned', test: { type: 'foil' } });
  phrases.set('nonfoil', { kind: 'owned', test: { type: 'nonfoil' } });
  return phrases;
}

/** Built in bare phrases. Folded, so lookups use `foldText` output. */
export const STATIC_PHRASES: ReadonlyMap<string, PhraseTarget> = buildStaticPhrases();

/** Longest bare phrase tried when matching words from the query, in words. */
export const MAX_PHRASE_WORDS = 4;

/** Bare keyword words. These also match names, since a few card names reuse them. */
export const BARE_KEYWORDS: ReadonlySet<string> = new Set(KEYWORDS.map((keyword) => keyword.toLowerCase()));

/** Short variant spellings mapped to the folded canonical variant name. */
export const VARIANT_ALIASES: Readonly<Record<string, string>> = {
  alt: 'alternate art',
  altart: 'alternate art',
  alternate: 'alternate art',
  art: 'alternate art',
  sig: 'signature',
  over: 'overnumbered',
  ovn: 'overnumbered',
  std: 'standard',
  base: 'standard',
  normal: 'standard',
};
