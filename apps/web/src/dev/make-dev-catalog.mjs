// Dev-only: builds a rough Catalog from data/raw/cards.json into src/dev/dev-catalog.json (served by the dev server only) so the
// UI can run before the real catalog build exists. The app prefers /catalog.json when present.
// Usage: node apps/web/src/dev/make-dev-catalog.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../../', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('data/raw/cards.json', root), 'utf8'));

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const baseName = (name) => name.replace(/\s*\((.*?)\)\s*$/, '').trim();
const KEYWORDS = ['Assault', 'Shield', 'Tank', 'Accelerate', 'Deflect', 'Ganking', 'Hidden', 'Legion', 'Temporary'];

const cards = {};
const printings = {};
const setCounts = {};

for (const entry of raw) {
  const cardKey = slug(baseName(entry.name));
  const variant = entry.metadata.signature
    ? 'signature'
    : entry.metadata.overnumbered
      ? 'overnumbered'
      : entry.metadata.alternate_art
        ? 'alternate-art'
        : 'standard';
  const printingKey = `${entry.set.set_id.toLowerCase()}-${String(entry.collector_number).padStart(3, '0')}-${variant}`;
  if (printings[printingKey]) continue;

  const text = entry.text.plain ?? '';
  cards[cardKey] ??= {
    cardKey,
    name: baseName(entry.name),
    type: entry.classification.type,
    supertype: entry.classification.supertype,
    domains: entry.classification.domain,
    energy: entry.attributes.energy,
    might: entry.attributes.might,
    power: entry.attributes.power,
    rulesText: text,
    tags: entry.tags ?? [],
    keywords: KEYWORDS.filter((word) => text.includes(word)),
    printingKeys: [],
  };
  cards[cardKey].printingKeys.push(printingKey);
  printings[printingKey] = {
    printingKey,
    cardKey,
    setId: entry.set.set_id,
    setLabel: entry.set.label,
    collectorNumber: entry.collector_number,
    riftboundId: entry.riftbound_id,
    variant,
    variantLabel: variant === 'standard' ? null : variant,
    rarity: entry.classification.rarity,
    imageUrl: entry.media.image_url,
    artist: entry.media.artist,
    sourceId: entry.id,
    tcgplayerId: entry.tcgplayer_id,
  };
  setCounts[entry.set.set_id] = { setId: entry.set.set_id, label: entry.set.label, count: (setCounts[entry.set.set_id]?.count ?? 0) + 1 };
}

const catalog = { builtAt: new Date().toISOString(), cards, printings, sets: Object.values(setCounts) };
const out = fileURLToPath(new URL('apps/web/src/dev/dev-catalog.json', root));
writeFileSync(out, JSON.stringify(catalog));
console.log(`dev catalog: ${Object.keys(cards).length} cards, ${Object.keys(printings).length} printings -> ${out}`);
