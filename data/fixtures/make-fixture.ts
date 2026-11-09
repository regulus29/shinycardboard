// Generates data/fixtures/cards.sample.json from the cached real pull (data/raw/cards.json).
// Usage: npx tsx data/fixtures/make-fixture.ts
// Selection is deterministic: records are sorted by riftbound_id then id before any pick,
// so rerunning on the same pull reproduces the same file.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitName, detectVariant } from '../../packages/core/src/catalog/variant';
import type { RiftcodexCard } from '../../packages/core/src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_PATH = resolve(HERE, '../raw/cards.json');
const OUTPUT_PATH = resolve(HERE, 'cards.sample.json');

/** Records picked per (set, type) and per (set, variant) to cover every combination. */
const PER_SET_TYPE = 3;
const PER_SET_VARIANT = 2;
const PER_DOMAIN = 3;
const TARGET_SIZE = 200;
const FILL_STRIDE = 7;

/** Whole families kept so the tests can assert on known cards and same-name collisions. */
const KEEP_BASE_NAMES = [
  'Red Brambleback',
  'Bewitching Spirit',
  'Azir - Emperor of the Sands',
  'Ezreal - Prodigal Explorer',
  'Sandswept Tomb',
  'Vi - Destructive',
  'Rebuttal',
  'Poppy - Paragon',
];
/** riftbound_id prefixes that exercise printing key collisions and token naming. */
const KEEP_ID_PREFIXES = [
  'opp-001-',
  'sfd-t03',
  'sfd-003-221',
  'ven-r04',
  'ven-004-',
  'ogn-27',
  'ogn-042',
  // Stale standard phantoms next to alternate art and overnumbered cards, and unflagged overnumbered cards.
  'ven-042',
  'ven-189-',
  'ven-084',
  'ven-167-',
  // Legend recorded under two name forms (champion-qualified and title only).
  'ven-149-',
  'ven-194-',
  // Same TCGplayer product listed twice in PR, an inferred alternate marker, and a labelled one-off.
  'pr-246',
  'pr-036',
  'unl-238-',
  'unl-229',
  'ogn-301',
  'opp-042',
  'pr-066-',
  'opp-197b-',
  'ogn-24',
  // Names the search tests rely on (compound names, shared first names).
  'ogn-078-',
  'ogn-030',
  'ogn-202',
];

const raw = (JSON.parse(readFileSync(RAW_PATH, 'utf8')) as RiftcodexCard[]).sort(
  (a, b) => a.riftbound_id.localeCompare(b.riftbound_id) || a.id.localeCompare(b.id),
);
const picked = new Map<string, RiftcodexCard>();
const pick = (record: RiftcodexCard) => picked.set(record.id, record);
const pickFirst = (records: RiftcodexCard[], count: number) => records.slice(0, count).forEach(pick);

const baseName = (record: RiftcodexCard) => splitName(record.name).baseName;
const variantOf = (record: RiftcodexCard) => detectVariant(record, splitName(record.name).suffixes).variant;
const groupBy = (key: (record: RiftcodexCard) => string) => {
  const groups = new Map<string, RiftcodexCard[]>();
  for (const record of raw) groups.set(key(record), [...(groups.get(key(record)) ?? []), record]);
  return [...groups.values()];
};

raw.filter((r) => KEEP_BASE_NAMES.includes(baseName(r))).forEach(pick);
raw.filter((r) => KEEP_ID_PREFIXES.some((prefix) => r.riftbound_id.startsWith(prefix))).forEach(pick);
groupBy((r) => `${r.set.set_id}|${r.classification.type}`).forEach((group) => pickFirst(group, PER_SET_TYPE));
groupBy((r) => `${r.set.set_id}|${variantOf(r)}`).forEach((group) => pickFirst(group, PER_SET_VARIANT));
groupBy((r) => r.classification.domain.join('+') || 'none').forEach((group) => pickFirst(group, PER_DOMAIN));
pickFirst(raw.filter((r) => r.attributes.energy === null && r.classification.type === 'Unit'), PER_DOMAIN);
pickFirst(raw.filter((r) => r.attributes.might === null && r.attributes.energy !== null), PER_DOMAIN);

// Spread the remainder evenly across the pull until the target size is reached.
for (let i = 0; picked.size < TARGET_SIZE && i < raw.length; i += FILL_STRIDE) pick(raw[i] as RiftcodexCard);

const fixture = raw.filter((record) => picked.has(record.id));
writeFileSync(OUTPUT_PATH, `${JSON.stringify(fixture, null, 1)}\n`);
console.log(`Wrote ${fixture.length} records to ${OUTPUT_PATH}`);
