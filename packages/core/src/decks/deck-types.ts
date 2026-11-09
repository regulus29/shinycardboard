import type { Domain } from '../types';

export type IssueSeverity = 'error' | 'warning';

export type DeckIssueCode =
  | 'no-legend'
  | 'main-size'
  | 'no-champion'
  | 'copy-limit'
  | 'domain-identity'
  | 'rune-size'
  | 'rune-domain'
  | 'battlefield-count'
  | 'battlefield-duplicate'
  | 'sideboard-size'
  | 'signature-mismatch'
  | 'signature-limit'
  /** The legend champion tag could not be settled (no tag names a champion, or several do). */
  | 'champion-unresolved'
  | 'unknown-card'
  /** A card sits in a section it cannot go in (a Rune in the main deck, a Token anywhere). */
  | 'section-type';

export interface DeckIssue {
  severity: IssueSeverity;
  code: DeckIssueCode;
  message: string;
  cardKey?: string;
}

export interface DeckStats {
  mainCount: number;
  /** Main deck copies by energy cost. Cards without a cost are left out. */
  curve: Record<number, number>;
  byType: Record<string, number>;
  /** Multi-domain cards count once toward each of their domains. */
  byDomain: Partial<Record<Domain, number>>;
  /** Mean energy over main deck copies that have a cost. 0 for an empty deck. */
  averageEnergy: number;
}

export interface MissingEntry {
  cardKey: string;
  needed: number;
  owned: number;
  missing: number;
}

export interface SectionFill {
  have: number;
  need: number;
}

export interface LegendReadiness {
  legendKey: string;
  /** 0..1 share of a complete legal deck (legend, main, runes, battlefields) the collection could fill. Honest slot count. */
  completeness: number;
  /** 0..1 ranking score: completeness blended with champion, signature and card depth. Results are sorted by it. */
  score: number;
  /** Owned copies usable in the main deck for this legend (copy and signature limits applied, not capped at deck size). */
  ownedLegalCards: number;
  /** Slots across legend, main, runes and battlefields still unfilled. */
  shortBy: number;
  /** An owned Champion unit could be the chosen champion. */
  championAvailable: boolean;
  /** Distinct owned cards that could be the chosen champion. */
  championChoices: number;
  /** Owned copies that overlap the legend (shared domain or champion tag) without being legal. Ranking tie-breaker. */
  nearMiss: number;
  championStatus: 'resolved' | 'ambiguous' | 'unresolved';
  /** Usable owned signature copies, capped at the signature limit. */
  signatureOwned: number;
  /** Distinct owned legal main deck cards. */
  distinctMainCards: number;
  sections: { legend: SectionFill; main: SectionFill; runes: SectionFill; battlefields: SectionFill };
}

export type DeckSection = 'main' | 'runes' | 'battlefields' | 'sideboard';
/** Where a card naturally belongs: every section except the sideboard, which takes any of them. */
export type CardSection = Exclude<DeckSection, 'sideboard'>;

export interface FillSuggestion {
  cardKey: string;
  count: number;
  reason: string;
  /** Section the card belongs in. */
  section: DeckSection;
  /**
   * 'chosen-champion' marks the pick that should become the deck chosen champion.
   * 'missing-champion' is a marker (count 0): no owned champion fits, so a main slot is held
   * back for one. Use suggestMissing to find the cheapest champion to acquire.
   */
  role?: 'chosen-champion' | 'missing-champion';
}

/** A card to acquire to complete a legal deck. No prices, only relative rarity. */
export interface AcquireSuggestion {
  cardKey: string;
  count: number;
  reason: string;
  section: DeckSection | 'legend';
  /** Set on the buy that should become the deck chosen champion. */
  role?: 'chosen-champion';
}

export interface SectionStatus {
  section: DeckSection | 'legend';
  count: number;
  /** Count the section is considered complete at. */
  target: number;
  remaining: number;
  complete: boolean;
}

export interface DeckCompletion {
  sections: SectionStatus[];
  /** 0..1 over legend, main, runes and battlefields (sideboard is optional). */
  percent: number;
  /** Every section complete and no error level issues. */
  ready: boolean;
}

export interface ConflictEntry {
  cardKey: string;
  owned: number;
  demanded: number;
  decks: string[];
}
