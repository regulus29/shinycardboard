// Test support only: loads the committed fixture and the optional full pull, and builds synthetic raw records.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RiftcodexCard } from '../types';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const FIXTURE_PATH = resolve(REPO_ROOT, 'data/fixtures/cards.sample.json');
export const REAL_DATA_PATH = resolve(REPO_ROOT, 'data/raw/cards.json');

export const REAL_DATA_AVAILABLE = existsSync(REAL_DATA_PATH);
export const REAL_DATA_SKIP_REASON = `data/raw/cards.json not found; run "python -I scripts/riftcodex_spike.py" or "npm run build:catalog" to enable`;

export function loadFixtureRaw(): RiftcodexCard[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as RiftcodexCard[];
}

export function loadRealRaw(): RiftcodexCard[] {
  return JSON.parse(readFileSync(REAL_DATA_PATH, 'utf8')) as RiftcodexCard[];
}

type Overrides = Partial<Omit<RiftcodexCard, 'metadata' | 'classification' | 'set' | 'media' | 'text' | 'attributes'>> & {
  metadata?: Partial<RiftcodexCard['metadata']>;
  classification?: Partial<RiftcodexCard['classification']>;
  set?: Partial<RiftcodexCard['set']>;
  media?: Partial<RiftcodexCard['media']>;
  text?: Partial<RiftcodexCard['text']>;
  attributes?: Partial<RiftcodexCard['attributes']>;
};

/** A valid synthetic raw record; override only what a test cares about. */
export function rawCard(overrides: Overrides = {}): RiftcodexCard {
  const id = overrides.id ?? `id-${overrides.name ?? 'card'}-${overrides.riftbound_id ?? '0'}`;
  return {
    id,
    name: 'Test Card',
    riftbound_id: 'tst-001-100',
    tcgplayer_id: null,
    collector_number: 1,
    tags: [],
    orientation: 'portrait',
    ...overrides,
    attributes: { energy: 2, might: 2, power: 1, ...overrides.attributes },
    classification: { type: 'Unit', supertype: null, rarity: 'Common', domain: ['Fury'], ...overrides.classification },
    text: { rich: null, plain: '', flavour: null, ...overrides.text },
    set: { set_id: 'TST', label: 'Test Set', ...overrides.set },
    media: { image_url: `https://img.example/${id}.png`, artist: 'Artist', ...overrides.media },
    metadata: {
      clean_name: 'Test Card',
      alternate_art: false,
      overnumbered: false,
      signature: false,
      ...overrides.metadata,
    },
  };
}
