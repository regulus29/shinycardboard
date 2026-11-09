import { QUERY_PARAM } from '../config/constants';

/** Route patterns (for <Route path>) and builders (for links). Never hand-write these strings elsewhere. */
export const ROUTES = {
  collection: '/collection',
  sets: '/sets',
  decks: '/decks',
  deck: '/decks/:deckId',
  card: '/card/:printingKey',
  settings: '/settings',
} as const;

export const paths = {
  /** Collection, optionally with an omnibox query: `/collection?q=fury+unit`. */
  collection: (query?: string): string =>
    query?.trim() ? `${ROUTES.collection}?${QUERY_PARAM}=${encodeURIComponent(query.trim())}` : ROUTES.collection,
  sets: (): string => ROUTES.sets,
  decks: (): string => ROUTES.decks,
  deck: (deckId: string): string => `/decks/${encodeURIComponent(deckId)}`,
  card: (printingKey: string): string => `/card/${encodeURIComponent(printingKey)}`,
  settings: (): string => ROUTES.settings,
};
