/**
 * Public surface of the deck module. Implementation lives in cohesive files beside this one:
 * deck-types, identity (rules model), validate, stats, ownership, legal, buildable, suggest,
 * hand and completion. Limits come from rules/rules.config.json, never from code.
 */
export { defaultRules, defaultAssist } from '../rules/rules';
export type { RulesConfig, AssistConfig } from '../rules/rules';

export type {
  IssueSeverity,
  DeckIssueCode,
  DeckIssue,
  DeckStats,
  MissingEntry,
  ConflictEntry,
  LegendReadiness,
  FillSuggestion,
  AcquireSuggestion,
  SectionFill,
  DeckSection,
  CardSection,
  SectionStatus,
  DeckCompletion,
} from './deck-types';

export { validateDeck } from './validate';
export { deckStats } from './stats';
export { ownedByCard, ownedByPrinting, missingCards, allocationConflicts } from './ownership';
export { legalCards } from './legal';
export { buildableLegends } from './buildable';
export { suggestFill, suggestMissing } from './suggest';
export { deckCompletion } from './completion';
export { drawHand, mulligan, seededRng } from './hand';
export type { SampleHand, RandomSource } from './hand';
export { totalSlots } from './slots';
export { legendChampionTags, legendIdentity, resolveLegendChampion } from './identity';
export type { ChampionResolution } from './identity';
