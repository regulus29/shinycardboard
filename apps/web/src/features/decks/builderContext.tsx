import { createContext, useContext } from 'react';
import type {
  AcquireSuggestion,
  FillSuggestion,
  Card,
  Catalog,
  ConflictEntry,
  Deck,
  DeckCompletion,
  DeckIssue,
  DeckSection,
  DeckStats,
  MissingEntry,
  OwnedEntry,
  RulesConfig,
  SearchContext,
} from '@sc/core';
import type { PoolScope } from './constants';
import type { PoolFilters } from './poolModel';

export interface PoolControls {
  query: string;
  scope: PoolScope;
  filters: PoolFilters;
}

export interface AssistData {
  /** Owned cards that would fill the deck (count above zero). */
  picks: FillSuggestion[];
  /** Set when no owned champion fits the legend. */
  marker: FillSuggestion | undefined;
  /** Cards to buy, only computed once requested. */
  buy: AcquireSuggestion[];
  showBuy: boolean;
  setShowBuy: (show: boolean) => void;
  /** Look for champions in the pool: main section, all cards, champions only. */
  browseChampions: () => void;
}

export interface BuilderApi {
  assist: AssistData;
  catalog: Catalog;
  rules: RulesConfig;
  deck: Deck;
  edit: (change: (deck: Deck) => Deck) => void;
  legend: Card | undefined;
  chosenChampion: Card | undefined;
  /** Cards legal for the deck legend and champion. */
  legal: Card[];
  owned: OwnedEntry[];
  ownedCounts: Record<string, number>;
  searchContext: SearchContext | undefined;
  allDecks: Deck[];
  section: DeckSection;
  setSection: (section: DeckSection) => void;
  pool: PoolControls;
  setPool: (change: Partial<PoolControls>) => void;
  issues: DeckIssue[];
  stats: DeckStats;
  completion: DeckCompletion;
  missing: MissingEntry[];
  conflicts: ConflictEntry[];
  /** Deck card keys the catalog no longer has. */
  retired: string[];
  openLegendPicker: () => void;
}

const BuilderContext = createContext<BuilderApi | null>(null);

export const BuilderProvider = BuilderContext.Provider;

export function useBuilder(): BuilderApi {
  const api = useContext(BuilderContext);
  if (!api) throw new Error('useBuilder must be used inside the deck builder');
  return api;
}
