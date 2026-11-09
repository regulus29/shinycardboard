/** Fields that identify a printing before keys exist. */
export interface KeyInput {
  riftboundId: string;
  setId: string;
  variantSlug: string;
  tcgplayerId: string | null;
  sourceId: string;
}

/** How many trailing characters of a source id make a readable disambiguator. */
const SOURCE_ID_TAIL = 8;

/** Source ids use `*` for overnumbered and signature markers; keys stay URL and filename friendly. */
function normalizeSourceId(riftboundId: string): string {
  return riftboundId.toLowerCase().replace(/\*/g, 'x').replace(/[^a-z0-9-]+/g, '-');
}

/**
 * Stable identity of a printing: the source id (which already encodes set, number, marker
 * and product line, for example "opp-001-298") plus the variant. It never depends on other
 * records, so adding, removing or renaming other cards cannot change it.
 */
export function baseKey(input: KeyInput): string {
  const set = input.setId.toLowerCase();
  const source = normalizeSourceId(input.riftboundId);
  const prefix = source.startsWith(`${set}-`) ? '' : `${set}-`;
  return `${prefix}${source}-${input.variantSlug}`;
}

function disambiguator(input: KeyInput): string {
  return input.tcgplayerId ? `t${input.tcgplayerId}` : `s${input.sourceId.slice(-SOURCE_ID_TAIL)}`;
}

function groupByBaseKey(inputs: KeyInput[]): Map<string, KeyInput[]> {
  const groups = new Map<string, KeyInput[]>();
  for (const input of inputs) {
    const key = baseKey(input);
    const group = groups.get(key);
    if (group) group.push(input);
    else groups.set(key, [input]);
  }
  return groups;
}

/**
 * Assign globally unique printing keys, returned in input order.
 *
 * Almost every record is unique on source id plus variant. When two are not, the member with
 * the smallest source id (ids are creation ordered, so the oldest record) keeps the base key
 * and the others append their own TCGplayer id or source id tail. A suffix depends only on the
 * record itself. The build reports collisions so they can be reviewed.
 */
export function assignPrintingKeys(inputs: KeyInput[]): string[] {
  const keys = new Map<KeyInput, string>();
  for (const [base, group] of groupByBaseKey(inputs)) {
    const sorted = [...group].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    sorted.forEach((input, position) => {
      keys.set(input, position === 0 ? base : `${base}-${disambiguator(input)}`);
    });
  }
  assertUnique([...keys.values()]);
  return inputs.map((input) => keys.get(input) as string);
}

/** A leftover clash means the source data is broken; fail loudly instead of overwriting a printing. */
function assertUnique(keys: string[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`Cannot build a unique printing key for ${key}`);
    seen.add(key);
  }
}

/** Number of digits collector numbers were padded to in the first key format. */
const LEGACY_PAD_WIDTH = 3;

/** The first key format, `${set}-${number}-${variant}`, kept only to alias old stored keys. */
export function legacyKey(input: Pick<KeyInput, 'setId' | 'variantSlug'> & { collectorNumber: number }): string {
  const number = String(input.collectorNumber).padStart(LEGACY_PAD_WIDTH, '0');
  return `${input.setId}-${number}-${input.variantSlug}`.toLowerCase();
}
