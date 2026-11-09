import type { CardType, Domain, Variant } from '../types';

/** Closed vocabularies shared by the catalog build and the search engine. */

export const DOMAINS: readonly Domain[] = [
  'Fury',
  'Calm',
  'Mind',
  'Body',
  'Chaos',
  'Order',
  'Colorless',
];

export const CARD_TYPES: readonly CardType[] = [
  'Unit',
  'Spell',
  'Gear',
  'Legend',
  'Battlefield',
  'Rune',
];

/** Lowest to highest, used for rarity sorting. Unknown rarities sort after these. */
export const RARITIES: readonly string[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Showcase',
  'Promo',
];

/** Display order of variants; standard always leads. */
export const VARIANT_ORDER: readonly Variant[] = [
  'standard',
  'alternate-art',
  'overnumbered',
  'signature',
  'metal',
  'other',
];

/** Human labels for variants, used when no name suffix supplies one. */
export const VARIANT_LABELS: Partial<Record<Variant, string>> = {
  'alternate-art': 'Alternate Art',
  overnumbered: 'Overnumbered',
  signature: 'Signature',
  metal: 'Metal',
};

/** Name suffix (case insensitive) that marks the OPP metal printings. */
export const METAL_SUFFIX = 'metal';

/**
 * Main sets in release order. The source data carries no release dates, so this is a small
 * config table. Sets not listed here (a new release) sort after these and before promo sets.
 */
export const MAIN_SET_ORDER: readonly string[] = ['OGN', 'OGS', 'SFD', 'UNL', 'VEN'];

/** Promotional sets, always last, in this order. */
export const PROMO_SET_ORDER: readonly string[] = ['OPP', 'PR', 'JDG'];

/**
 * Keywords recognised in bracketed rules text, e.g. "[Assault 2]".
 * Derived from the bracketed terms in the real dataset: every term that is followed by
 * reminder text somewhere (Accelerate, Ambush, Assault, Backline, Deflect, Ganking, Hidden,
 * Hunt, Quick-Draw, Shield, Tank, Temporary, Vision, Weaponmaster, Action, Reaction)
 * plus the rule keywords that only appear bare (Deathknell, Equip, Legion, Predict, Repeat).
 * Effect verbs and status words (Buff, Stun, Burn, Add, Level, Mighty, Flow, Empower) are excluded.
 */
export const KEYWORDS: readonly string[] = [
  'Accelerate',
  'Action',
  'Ambush',
  'Assault',
  'Backline',
  'Deathknell',
  'Deflect',
  'Equip',
  'Ganking',
  'Hidden',
  'Hunt',
  'Legion',
  'Predict',
  'Quick-Draw',
  'Reaction',
  'Repeat',
  'Shield',
  'Tank',
  'Temporary',
  'Vision',
  'Weaponmaster',
];

/**
 * Bracketed terms seen in the data that are effects, statuses or markers rather than keywords.
 * Anything bracketed that is in neither list is flagged by the build as a possible new mechanic.
 */
export const KNOWN_NON_KEYWORD_TERMS: readonly string[] = [
  '>',
  '>>',
  'Add',
  'Buff',
  'Burn',
  'Empower',
  'Empowered',
  'Flow',
  'Level',
  'Mighty',
  'Stun',
  'Unique',
];
