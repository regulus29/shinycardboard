import type { Card, CardType, Catalog, Domain, Printing, Variant } from '../types';

/** Hand-made catalog fixtures modeled on the real Riftcodex records. Test support only. */

interface PrintingSpec {
  setId: string;
  setLabel: string;
  number: number;
  /** Source id number segment, for example "029a". Defaults to the padded number. */
  idNumber?: string;
  variant?: Variant;
  variantLabel?: string;
  tcgplayerId?: string | null;
  rarity?: string;
}

interface CardSpec {
  cardKey: string;
  name: string;
  type: CardType;
  supertype?: string;
  domains: Domain[];
  printings: PrintingSpec[];
}

const OGN = { setId: 'OGN', setLabel: 'Origins' };
const UNL = { setId: 'UNL', setLabel: 'Unleashed' };
const OPP = { setId: 'OPP', setLabel: 'Organized Play Promos' };

const CARD_SPECS: CardSpec[] = [
  {
    cardKey: 'bewitching-spirit',
    name: 'Bewitching Spirit',
    type: 'Unit',
    domains: ['Chaos'],
    printings: [
      { ...UNL, number: 121, tcgplayerId: '685592', rarity: 'Common' },
      { ...UNL, number: 121, idNumber: '121a', variant: 'alternate-art', variantLabel: 'Alternate Art', tcgplayerId: '685593', rarity: 'Common' },
    ],
  },
  {
    cardKey: 'vi-piltover-enforcer',
    name: 'Vi - Piltover Enforcer',
    type: 'Legend',
    domains: ['Fury', 'Order'],
    printings: [
      { ...UNL, number: 229, idNumber: '229*', variant: 'signature', variantLabel: 'Signature', tcgplayerId: '685522', rarity: 'Rare' },
    ],
  },
  {
    cardKey: 'vi',
    name: 'Vi',
    type: 'Unit',
    supertype: 'Champion',
    domains: ['Fury', 'Order'],
    printings: [{ ...UNL, number: 30, tcgplayerId: '685601', rarity: 'Epic' }],
  },
  {
    cardKey: 'fury-rune',
    name: 'Fury Rune',
    type: 'Rune',
    domains: ['Fury'],
    printings: [
      { ...OGN, number: 7, tcgplayerId: '650001', rarity: 'Common' },
      { ...OPP, number: 1, variant: 'metal', variantLabel: 'Metal', tcgplayerId: '650002', rarity: 'Rare' },
    ],
  },
  {
    cardKey: 'kaisa',
    name: "Kai'Sa",
    type: 'Unit',
    domains: ['Calm'],
    printings: [{ ...OGN, number: 100, tcgplayerId: '650100', rarity: 'Rare' }],
  },
  {
    cardKey: 'windswept-hillock',
    name: 'Windswept Hillock',
    type: 'Battlefield',
    domains: ['Colorless'],
    printings: [{ ...OGN, number: 290, tcgplayerId: '650290', rarity: 'Uncommon' }],
  },
  {
    cardKey: 'stalwart-poro',
    name: 'Stalwart Poro',
    type: 'Unit',
    domains: ['Order'],
    printings: [{ ...OGN, number: 42, tcgplayerId: '650042', rarity: 'Common' }],
  },
  {
    cardKey: 'gold-buff',
    name: 'Gold // Buff',
    type: 'Spell',
    domains: ['Order'],
    printings: [{ ...OGN, number: 150, tcgplayerId: '650150', rarity: 'Uncommon' }],
  },
  {
    cardKey: 'fury-bolt',
    name: 'Fury Bolt',
    type: 'Spell',
    domains: ['Fury'],
    printings: [
      { ...OGN, number: 120, tcgplayerId: '650120', rarity: 'Common' },
      { ...OGN, number: 120, idNumber: '120a', variant: 'overnumbered', variantLabel: 'Overnumbered', tcgplayerId: null, rarity: 'Common' },
    ],
  },
];

const pad = (n: number): string => String(n).padStart(3, '0');

function buildPrinting(card: CardSpec, spec: PrintingSpec): Printing {
  const variant = spec.variant ?? 'standard';
  const idNumber = spec.idNumber ?? pad(spec.number);
  return {
    printingKey: `${spec.setId.toLowerCase()}-${pad(spec.number)}-${variant}`,
    cardKey: card.cardKey,
    setId: spec.setId,
    setLabel: spec.setLabel,
    collectorNumber: spec.number,
    riftboundId: `${spec.setId.toLowerCase()}-${idNumber}-219`,
    variant,
    variantLabel: spec.variantLabel ?? null,
    rarity: spec.rarity ?? 'Common',
    imageUrl: `https://example.invalid/${card.cardKey}.png`,
    artist: null,
    sourceId: `fixture-${card.cardKey}-${variant}`,
    tcgplayerId: spec.tcgplayerId ?? null,
  };
}

/** A small catalog with standard, alternate art, signature, overnumbered and metal printings. */
export function fixtureCatalog(): Catalog {
  const cards: Record<string, Card> = {};
  const printings: Record<string, Printing> = {};
  for (const spec of CARD_SPECS) {
    const built = spec.printings.map((p) => buildPrinting(spec, p));
    built.forEach((p) => (printings[p.printingKey] = p));
    cards[spec.cardKey] = {
      cardKey: spec.cardKey,
      name: spec.name,
      type: spec.type,
      supertype: spec.supertype ?? null,
      domains: spec.domains,
      energy: null,
      might: null,
      power: null,
      rulesText: '',
      tags: [],
      keywords: [],
      printingKeys: built.map((p) => p.printingKey),
    };
  }
  const sets = [OGN, UNL, OPP].map((s) => ({
    setId: s.setId,
    label: s.setLabel,
    count: Object.values(printings).filter((p) => p.setId === s.setId).length,
  }));
  return { builtAt: 'fixture', cards, printings, sets };
}

/** Printing keys of the fixture, for readable assertions. */
export const KEYS = {
  spirit: 'unl-121-standard',
  spiritAlt: 'unl-121-alternate-art',
  legend: 'unl-229-signature',
  vi: 'unl-030-standard',
  rune: 'ogn-007-standard',
  runeMetal: 'opp-001-metal',
  kaisa: 'ogn-100-standard',
  battlefield: 'ogn-290-standard',
  poro: 'ogn-042-standard',
  bolt: 'ogn-120-standard',
  boltOver: 'ogn-120-overnumbered',
} as const;

/** A synthetic catalog of `size` distinct card names, for performance tests. */
export function largeCatalog(size: number): Catalog {
  const catalog = fixtureCatalog();
  const syllables = ['ka', 'zor', 'mi', 'ven', 'dra', 'lo', 'shi', 'tur', 'bel', 'nox'];
  for (let i = 0; i < size; i++) {
    const name = `${syllables[i % 10]}${syllables[(i * 7) % 10]}${syllables[(i * 3 + 1) % 10]} ${syllables[(i * 11) % 10]}${i}`;
    const printingKey = `big-${String(i).padStart(4, '0')}-standard`;
    const cardKey = `big-${i}`;
    catalog.cards[cardKey] = { ...catalog.cards['stalwart-poro']!, cardKey, name, printingKeys: [printingKey] };
    catalog.printings[printingKey] = {
      ...catalog.printings[KEYS.poro]!,
      printingKey,
      cardKey,
      setId: 'BIG',
      collectorNumber: i,
      riftboundId: `big-${String(i).padStart(3, '0')}-1`,
      tcgplayerId: null,
    };
  }
  return catalog;
}
