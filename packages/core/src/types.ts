/** Shared domain model. Every package codes against these types. */

export type Domain = 'Fury' | 'Calm' | 'Mind' | 'Body' | 'Chaos' | 'Order' | 'Colorless';
export type CardType = 'Unit' | 'Spell' | 'Gear' | 'Legend' | 'Battlefield' | 'Rune';
export type Variant =
  | 'standard'
  | 'alternate-art'
  | 'overnumbered'
  | 'signature'
  | 'metal'
  | 'other';
export type Finish = 'normal' | 'foil';
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

/** Raw record shape returned by the Riftcodex API (fields we consume). */
export interface RiftcodexCard {
  id: string;
  name: string;
  riftbound_id: string;
  tcgplayer_id: string | null;
  collector_number: number;
  attributes: { energy: number | null; might: number | null; power: number | null };
  classification: {
    type: string;
    supertype: string | null;
    rarity: string;
    domain: string[];
  };
  text: { rich: string | null; plain: string | null; flavour?: string | null };
  set: { set_id: string; label: string };
  media: { image_url: string; artist: string | null; accessibility_text?: string | null };
  tags: string[];
  orientation: string;
  metadata: {
    clean_name: string;
    alternate_art: boolean;
    overnumbered: boolean;
    signature: boolean;
    updated_on?: string;
  };
}

/** A game card concept: identical rules text and stats, independent of printing. */
export interface Card {
  /** Stable key: lowercase base name with variant suffixes removed, hyphen separated. */
  cardKey: string;
  name: string;
  type: CardType;
  supertype: string | null;
  domains: Domain[];
  energy: number | null;
  might: number | null;
  power: number | null;
  rulesText: string;
  /** Champion or faction labels from the source data (for example "Vi", "Piltover"). */
  tags: string[];
  /** Keywords parsed from rules text, for example "Assault", "Shield". */
  keywords: string[];
  /** Printing keys belonging to this card, standard printing first. */
  printingKeys: string[];
}

/** One physical printing of a card. Owned copies attach here. */
export interface Printing {
  /** Stable key: `${setId}-${paddedNumber}-${variantSlug}` lowercase, for example "unl-029-alternate-art". */
  printingKey: string;
  cardKey: string;
  setId: string;
  setLabel: string;
  collectorNumber: number;
  /** Source id such as "unl-029a-219". */
  riftboundId: string;
  variant: Variant;
  /** Label for the variant as shown on the card name, for example "Metal". Null for standard. */
  variantLabel: string | null;
  rarity: string;
  imageUrl: string;
  artist: string | null;
  sourceId: string;
  tcgplayerId: string | null;
}

export interface Catalog {
  /** Source description, for example the dataset pull date. */
  builtAt: string;
  cards: Record<string, Card>;
  printings: Record<string, Printing>;
  /** Set codes in release order where known. */
  sets: { setId: string; label: string; count: number }[];
}

/** Every user record that syncs. Deletes are tombstones so they propagate. */
export interface SyncRecord {
  id: string;
  /** Epoch milliseconds of the last local change. Last write wins. */
  updatedAt: number;
  deleted?: boolean;
}

/** A row in the collection: copies of one printing in one finish and condition. */
export interface OwnedEntry extends SyncRecord {
  printingKey: string;
  finish: Finish;
  condition: Condition;
  quantity: number;
  notes?: string;
}

/** User tags attached to a card concept. One record per card. */
export interface CardTagging extends SyncRecord {
  /** Equals the cardKey, so the record is addressable without a lookup. */
  id: string;
  cardKey: string;
  tags: string[];
  note?: string;
}

export interface DeckSlot {
  cardKey: string;
  count: number;
  /** Optional pinned printing; otherwise any owned printing can fill the slot. */
  printingKey?: string;
}

export interface Deck extends SyncRecord {
  name: string;
  /** cardKey of the Champion Legend. */
  legendKey?: string;
  /** Main deck including the chosen champion. */
  main: DeckSlot[];
  runes: DeckSlot[];
  battlefields: DeckSlot[];
  sideboard: DeckSlot[];
  notes?: string;
  tags?: string[];
}

export interface SavedSearch extends SyncRecord {
  name: string;
  query: string;
}

export interface UserData {
  owned: OwnedEntry[];
  taggings: CardTagging[];
  decks: Deck[];
  savedSearches: SavedSearch[];
}

/** Names of the synced collections, shared by client and server. */
export const SYNC_COLLECTIONS = ['owned', 'taggings', 'decks', 'savedSearches'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];
