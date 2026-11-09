/** Import preview model: what a pasted deck list will become, before anything is saved. */
import { parseDeckText, validateDeck, type Catalog, type Deck, type DeckIssue, type DeckSection } from '@sc/core';
import { SECTION_LABELS, SECTION_ORDER } from './constants';
import { slotsOf, totalCount } from './deckModel';

export interface MatchedLine {
  section: DeckSection;
  cardKey: string;
  name: string;
  count: number;
}

export interface ImportPreview {
  deck: Deck;
  matched: MatchedLine[];
  unmatched: string[];
  sectionCounts: Record<DeckSection, number>;
  legendName?: string;
  championName?: string;
  issues: DeckIssue[];
  /** Nothing usable was found in the text. */
  empty: boolean;
}

function nameOf(catalog: Catalog, cardKey: string): string {
  return catalog.cards[cardKey]?.name ?? cardKey;
}

export function buildImportPreview(text: string, catalog: Catalog, now: number): ImportPreview {
  const { deck, unmatched } = parseDeckText(text, catalog, now);
  const matched = SECTION_ORDER.flatMap((section) =>
    slotsOf(deck, section).map((slot) => ({ section, cardKey: slot.cardKey, name: nameOf(catalog, slot.cardKey), count: slot.count })),
  );
  const sectionCounts = Object.fromEntries(SECTION_ORDER.map((section) => [section, totalCount(slotsOf(deck, section))])) as Record<DeckSection, number>;
  const empty = matched.length === 0 && !deck.legendKey;
  return {
    deck,
    matched,
    unmatched,
    sectionCounts,
    legendName: deck.legendKey ? nameOf(catalog, deck.legendKey) : undefined,
    championName: deck.chosenChampionKey ? nameOf(catalog, deck.chosenChampionKey) : undefined,
    issues: empty ? [] : validateDeck(deck, catalog),
    empty,
  };
}

/** One line per section for the summary, for example "Main deck 40". */
export function sectionSummary(preview: ImportPreview): string[] {
  return SECTION_ORDER.filter((section) => preview.sectionCounts[section] > 0).map((section) => `${SECTION_LABELS[section]} ${preview.sectionCounts[section]}`);
}
